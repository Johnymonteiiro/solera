"""
Análise do estudo "Agent-as-judge vs avaliação humana" (Solera MAS).

Responde:
  RQ1 — o Judge (LLM-as-judge) concorda com os humanos no mesmo rubric?
        (a) critérios 0-10: Spearman, Pearson, ICC, MAE, % dentro de +-1/+-2
        (b) flags booleanas (bait / link): Cohen's kappa
        (c) piso de comparação: confiabilidade ENTRE humanos (ICC 2,1 e 2,k)
        (d) teto de comparação: confiabilidade do próprio juiz (test-retest)
  RQ2 — usar o Judge melhora a qualidade percebida?
        pareado por tópico (n = tópicos) e por avaliador (n = avaliadores),
        sempre com tamanho de efeito — com n pequeno o p-valor sozinho não diz nada.

Entradas (em study/data/ por padrão):
  - agent-metrics.csv : GET /api/mas/export/agent-metrics?format=csv
                        já traz as colunas `post`, `threadId`, `condition` e `topic`,
                        então a junção com o form é direta pela letra do post.
  - form-responses.csv: export do Google Forms (1 linha por avaliador),
                        colunas <POST>_<criterio> — ver study/FORM-AVALIACAO.md
  - mapping.csv       : opcional, GET ...?format=mapping. Só serve de conferência:
                        se divergir do agent-metrics.csv, o script avisa.
  - judge-repeat.csv  : opcional, GET /api/mas/export/judge-repeat?n=5&format=csv
                        n re-pontuações dos mesmos drafts -> confiabilidade intra-juiz.

Saídas (em study/analysis/out/): um CSV por análise + summary.txt + figuras.

Uso:
  python quality_study.py                # usa study/data/
  python quality_study.py --demo         # sintético em study/data/demo/ (não toca no real)
  python quality_study.py --data-dir X

Dependências: pandas, numpy, scipy, matplotlib
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Critérios numéricos 0-10 avaliados por ambos (agente e humano).
NUMERIC = ["overall", "hook", "originality", "scannability", "cta"]
# Nome do critério no form -> coluna correspondente no agent-metrics.csv.
AGENT_COL = {
    "overall": "score",
    "hook": "hookQuality",
    "originality": "originality",
    "scannability": "scannability",
    "cta": "ctaQuality",
}
# Flags booleanas: sufixo no form -> coluna no agent-metrics.csv.
FLAGS = {"bait": "hasEngagementBait", "link": "hasExternalLinkInBody"}

HERE = os.path.dirname(os.path.abspath(__file__))
_LOG: list[str] = []


def log(msg: str = "") -> None:
    print(msg)
    _LOG.append(msg)


def as_bool(value) -> float:
    """Sim/Nao/True/False/1/0 -> 1.0/0.0 (NaN quando não dá pra ler)."""
    if isinstance(value, (bool, np.bool_)):
        return float(value)
    text = str(value).strip().lower()
    if text in {"sim", "s", "true", "verdadeiro", "1", "yes", "y"}:
        return 1.0
    if text in {"não", "nao", "n", "false", "falso", "0", "no"}:
        return 0.0
    return float("nan")


# ───────────────────────── métricas de confiabilidade ───────────────────────
def icc(matrix: np.ndarray) -> tuple[float, float]:
    """ICC(2,1) e ICC(2,k) — two-way random effects, absolute agreement.

    `matrix`: linhas = alvos (posts), colunas = avaliadores. Mede concordância
    em VALOR ABSOLUTO, não só em ordenação (que é o que Spearman capta) — é a
    métrica certa para "o juiz dá a MESMA nota que o humano", e não apenas
    "ordena os posts na mesma sequência".
    """
    m = np.asarray(matrix, dtype=float)
    if m.ndim != 2:
        return float("nan"), float("nan")
    n, k = m.shape
    if n < 2 or k < 2:
        return float("nan"), float("nan")
    grand = m.mean()
    ms_rows = k * ((m.mean(axis=1) - grand) ** 2).sum() / (n - 1)
    ms_cols = n * ((m.mean(axis=0) - grand) ** 2).sum() / (k - 1)
    resid = m - m.mean(axis=1, keepdims=True) - m.mean(axis=0, keepdims=True) + grand
    ms_err = (resid**2).sum() / ((n - 1) * (k - 1))
    denom1 = ms_rows + (k - 1) * ms_err + k * (ms_cols - ms_err) / n
    denom_k = ms_rows + (ms_cols - ms_err) / n
    icc1 = (ms_rows - ms_err) / denom1 if denom1 else float("nan")
    icck = (ms_rows - ms_err) / denom_k if denom_k else float("nan")
    return float(icc1), float(icck)


def cohen_kappa(a: np.ndarray, b: np.ndarray) -> float:
    """Cohen's kappa para dois rotuladores binários."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    mask = ~(np.isnan(a) | np.isnan(b))
    a, b = a[mask], b[mask]
    if len(a) == 0:
        return float("nan")
    po = float((a == b).mean())
    pe = float(a.mean() * b.mean() + (1 - a.mean()) * (1 - b.mean()))
    if np.isclose(pe, 1.0):
        # Sem variação dos dois lados: kappa fica indefinido, mas a concordância
        # bruta ainda informa — ela vai na coluna concord_*_pct.
        return float("nan")
    return (po - pe) / (1 - pe)


# ───────────────────────── carga / reshape ──────────────────────────────────
def load_inputs(data_dir: str):
    agent = pd.read_csv(os.path.join(data_dir, "agent-metrics.csv"))
    form = pd.read_csv(os.path.join(data_dir, "form-responses.csv"))

    if "post" not in agent.columns:
        raise SystemExit(
            "ERRO: agent-metrics.csv sem a coluna `post` (versão antiga do export).\n"
            "Baixe de novo: GET /api/mas/export/agent-metrics?format=csv"
        )

    mapping_path = os.path.join(data_dir, "mapping.csv")
    mapping = pd.read_csv(mapping_path) if os.path.exists(mapping_path) else None

    repeat_path = os.path.join(data_dir, "judge-repeat.csv")
    repeat = pd.read_csv(repeat_path) if os.path.exists(repeat_path) else None

    return agent, form, mapping, repeat


def check_mapping(agent: pd.DataFrame, mapping: pd.DataFrame | None) -> None:
    """mapping.csv é redundante por design — divergir significa edição à mão."""
    if mapping is None or "post" not in mapping.columns:
        return
    left = (
        agent[["post", "condition"]]
        .astype(str)
        .sort_values("post")
        .reset_index(drop=True)
    )
    right = (
        mapping[["post", "condition"]]
        .astype(str)
        .sort_values("post")
        .reset_index(drop=True)
    )
    if not left.equals(right):
        log(
            "AVISO: mapping.csv diverge do agent-metrics.csv (post x condition).\n"
            "  Os dois saem do mesmo endpoint — rebaixe ambos antes de confiar."
        )


def check_provenance(agent: pd.DataFrame) -> None:
    """Procedência: todas as notas têm que vir do mesmo rubric/modelo.

    `rubricHash` muda se alguém editar o prompt do código OU o override em
    `agent-config.json`. Misturar hashes no mesmo dataset significa comparar
    notas produzidas por instrumentos diferentes.
    """
    if "rubricHash" not in agent.columns:
        log(
            "AVISO: agent-metrics.csv sem `rubricHash` — notas anteriores ao "
            "registro de procedência. Não dá para atestar com que rubric saíram."
        )
        return
    hashes = set(agent["rubricHash"].dropna().astype(str)) - {"", "nan"}
    if len(hashes) > 1:
        log(f"AVISO: {len(hashes)} rubricHash distintos no dataset: {sorted(hashes)}")
        log("  As notas saíram de rubrics diferentes — não são comparáveis entre si.")
    elif len(hashes) == 1:
        models = sorted(set(agent.get("judgeModel", pd.Series(dtype=str)).dropna()))
        log(f"Procedência: rubric {hashes.pop()} · modelo {models or 'n/d'}")


def posts_in(agent: pd.DataFrame) -> list[str]:
    """A lista de posts vem dos dados, não de uma constante A-F fixa."""
    return sorted(agent["post"].astype(str).unique())


def human_long(form: pd.DataFrame, posts: list[str]) -> pd.DataFrame:
    """Forms wide (A_overall, ...) -> long (post, criterio, média/desvio humano)."""
    rows = []
    for post in posts:
        for crit in NUMERIC:
            col = f"{post}_{crit}"
            if col not in form.columns:
                continue
            vals = pd.to_numeric(form[col], errors="coerce").dropna()
            if len(vals):
                rows.append(
                    {
                        "post": post,
                        "criterio": crit,
                        "human_mean": vals.mean(),
                        "human_std": vals.std(ddof=1) if len(vals) > 1 else 0.0,
                        "n_raters": len(vals),
                    }
                )
    return pd.DataFrame(rows)


def agent_long(
    agent: pd.DataFrame, posts: list[str], repeat: pd.DataFrame | None = None
) -> pd.DataFrame:
    """agent-metrics -> long (post, criterio, agent_score). Junção direta por `post`.

    Quando há `judge-repeat.csv`, a nota oficial do agente passa a ser a MEDIANA
    das rodadas, não o valor único do agent-metrics.csv. Dois motivos:
      1. Uma amostragem só a temperatura 0.1 carrega variação de parse/raciocínio;
         a mediana de k descarta outlier de graça (prática padrão em LLM-as-judge).
      2. As notas gravadas no threadStore antes de 2026-08 saíram de um prompt
         contaminado (rubric duplicado). Re-pontuar e usar a mediana substitui
         aquelas notas sem precisar reescrever o histórico.
    """
    median_by = {}
    if repeat is not None and not repeat.empty and "post" in repeat.columns:
        for crit, acol in AGENT_COL.items():
            if acol not in repeat.columns:
                continue
            med = (
                repeat.assign(post=repeat["post"].astype(str))
                .groupby("post")[acol]
                .median()
            )
            for post, value in med.items():
                median_by[(str(post), crit)] = float(value)

    rows = []
    for _, r in agent.iterrows():
        post = str(r["post"])
        if post not in posts:
            continue
        for crit, acol in AGENT_COL.items():
            if acol not in agent.columns:
                continue
            value = median_by.get((post, crit))
            rows.append(
                {
                    "post": post,
                    "criterio": crit,
                    "agent_score": value if value is not None else float(r[acol]),
                    "fonte": "mediana_repeat" if value is not None else "execucao_unica",
                }
            )
    return pd.DataFrame(rows)


# ───────────────────────── RQ1a: concordância numérica ──────────────────────
def rq1_agreement(merged: pd.DataFrame) -> pd.DataFrame:
    out = []
    for crit in NUMERIC:
        sub = merged[merged["criterio"] == crit].dropna(
            subset=["agent_score", "human_mean"]
        )
        if len(sub) < 2:
            out.append({"criterio": crit, "n_posts": len(sub)})
            continue
        a, h = sub["agent_score"].to_numpy(), sub["human_mean"].to_numpy()
        diff = np.abs(a - h)
        sp = stats.spearmanr(a, h)
        pr = stats.pearsonr(a, h)
        icc1, _ = icc(np.column_stack([a, h]))
        out.append(
            {
                "criterio": crit,
                "n_posts": len(sub),
                "spearman_r": round(float(sp.correlation), 3),
                "spearman_p": round(float(sp.pvalue), 3),
                "pearson_r": round(float(pr.statistic), 3),
                "icc_juiz_humano": round(icc1, 3),
                # Positivo = o juiz é mais generoso que os humanos.
                "vies_medio": round(float((a - h).mean()), 3),
                "mae": round(float(diff.mean()), 3),
                "pct_dentro_1": round(float((diff <= 1).mean()) * 100, 1),
                "pct_dentro_2": round(float((diff <= 2).mean()) * 100, 1),
            }
        )
    return pd.DataFrame(out)


# ───────────────────────── RQ1b: flags booleanas ────────────────────────────
def agent_flag_by_post(
    agent: pd.DataFrame, acol: str, repeat: pd.DataFrame | None
) -> dict[str, float]:
    """Flag do agente por post — maioria das rodadas quando há judge-repeat."""
    if repeat is not None and not repeat.empty and acol in repeat.columns:
        vals = repeat.assign(
            post=repeat["post"].astype(str), _f=repeat[acol].map(as_bool)
        )
        maj = vals.groupby("post")["_f"].mean()
        if not maj.empty:
            return {str(p): (1.0 if v >= 0.5 else 0.0) for p, v in maj.items()}
    return {str(r["post"]): as_bool(r[acol]) for _, r in agent.iterrows()}


def rq1_flags(
    agent: pd.DataFrame,
    form: pd.DataFrame,
    posts: list[str],
    repeat: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Kappa agente x humano nas flags, em duas leituras.

    - `maioria`: agente vs voto majoritário dos humanos (n = posts).
    - `pooled` : agente vs cada avaliador, empilhado (n = posts x avaliadores),
                 mais estável quando há poucos posts.
    """
    out = []
    for suffix, acol in FLAGS.items():
        if acol not in agent.columns:
            continue
        agent_by_post = agent_flag_by_post(agent, acol, repeat)
        maj_a, maj_h, pool_a, pool_h = [], [], [], []
        for post in posts:
            col = f"{post}_{suffix}"
            if col not in form.columns or post not in agent_by_post:
                continue
            human_vals = form[col].map(as_bool).dropna()
            if not len(human_vals):
                continue
            av = agent_by_post[post]
            maj_a.append(av)
            maj_h.append(1.0 if human_vals.mean() >= 0.5 else 0.0)
            pool_a.extend([av] * len(human_vals))
            pool_h.extend(human_vals.tolist())
        if not maj_a:
            continue
        maj_a_arr, maj_h_arr = np.array(maj_a), np.array(maj_h)
        pool_a_arr, pool_h_arr = np.array(pool_a), np.array(pool_h)
        out.append(
            {
                "flag": acol,
                "n_posts": len(maj_a),
                "kappa_maioria": round(cohen_kappa(maj_a_arr, maj_h_arr), 3),
                "concord_maioria_pct": round(
                    float((maj_a_arr == maj_h_arr).mean()) * 100, 1
                ),
                "n_pares_pooled": len(pool_a),
                "kappa_pooled": round(cohen_kappa(pool_a_arr, pool_h_arr), 3),
                "concord_pooled_pct": round(
                    float((pool_a_arr == pool_h_arr).mean()) * 100, 1
                ),
                "taxa_agente": round(float(maj_a_arr.mean()), 3),
                "taxa_humana": round(float(pool_h_arr.mean()), 3),
            }
        )
    return pd.DataFrame(out)


# ───────────────────────── RQ1c: confiabilidade entre humanos ───────────────
def human_reliability(form: pd.DataFrame, posts: list[str]) -> pd.DataFrame:
    """ICC entre os avaliadores humanos — o piso de comparação do RQ1.

    Se os humanos concordam pouco entre si, não faz sentido cobrar do juiz uma
    concordância alta com a média deles: o próprio ground truth é ruidoso.
    """
    out = []
    for crit in NUMERIC:
        cols = [f"{p}_{crit}" for p in posts if f"{p}_{crit}" in form.columns]
        if len(cols) < 2:
            continue
        # linhas = posts, colunas = avaliadores
        matrix = form[cols].apply(pd.to_numeric, errors="coerce").to_numpy().T
        matrix = matrix[:, ~np.isnan(matrix).any(axis=0)]
        if matrix.shape[0] < 2 or matrix.shape[1] < 2:
            continue
        icc1, icck = icc(matrix)
        out.append(
            {
                "criterio": crit,
                "n_posts": int(matrix.shape[0]),
                "n_avaliadores": int(matrix.shape[1]),
                "icc_2_1": round(icc1, 3),
                "icc_2_k": round(icck, 3),
                "desvio_medio_entre_raters": round(
                    float(np.nanmean(matrix.std(axis=1, ddof=1))), 3
                ),
            }
        )
    return pd.DataFrame(out)


# ───────────────────────── RQ1d: test-retest do juiz ────────────────────────
def judge_retest(repeat: pd.DataFrame | None) -> pd.DataFrame:
    """Estabilidade do juiz re-pontuando os MESMOS drafts n vezes."""
    if repeat is None or repeat.empty or "post" not in repeat.columns:
        return pd.DataFrame()
    out = []
    for crit, acol in AGENT_COL.items():
        if acol not in repeat.columns:
            continue
        piv = repeat.pivot_table(
            index="post", columns="run", values=acol, aggfunc="mean"
        ).dropna()
        if piv.shape[0] < 2 or piv.shape[1] < 2:
            continue
        icc1, _ = icc(piv.to_numpy())
        out.append(
            {
                "criterio": crit,
                "n_posts": int(piv.shape[0]),
                "n_rodadas": int(piv.shape[1]),
                "sd_medio_intra_post": round(float(piv.std(axis=1, ddof=1).mean()), 3),
                "amplitude_media": round(
                    float((piv.max(axis=1) - piv.min(axis=1)).mean()), 3
                ),
                "icc_test_retest": round(icc1, 3),
                "pct_posts_flag_estavel": "",
            }
        )
    for acol in FLAGS.values():
        if acol not in repeat.columns:
            continue
        flags = repeat[["post", "run", acol]].copy()
        flags[acol] = flags[acol].map(as_bool)
        piv = flags.pivot_table(
            index="post", columns="run", values=acol, aggfunc="first"
        ).dropna()
        if piv.empty:
            continue
        out.append(
            {
                "criterio": acol,
                "n_posts": int(piv.shape[0]),
                "n_rodadas": int(piv.shape[1]),
                "sd_medio_intra_post": "",
                "amplitude_media": "",
                "icc_test_retest": "",
                "pct_posts_flag_estavel": round(
                    float((piv.nunique(axis=1) == 1).mean()) * 100, 1
                ),
            }
        )
    return pd.DataFrame(out)


# ───────────────────────── RQ2: efeito do judge ─────────────────────────────
def human_overall_by_post(form: pd.DataFrame, posts: list[str]) -> dict[str, float]:
    out = {}
    for post in posts:
        col = f"{post}_overall"
        if col in form.columns:
            vals = pd.to_numeric(form[col], errors="coerce").dropna()
            if len(vals):
                out[post] = float(vals.mean())
    return out


def paired_stats(com: np.ndarray, sem: np.ndarray) -> dict:
    """Wilcoxon + tamanhos de efeito para um vetor pareado."""
    diff = com - sem
    res: dict = {
        "n_pares": int(len(diff)),
        "media_com_judge": round(float(com.mean()), 3),
        "media_sem_judge": round(float(sem.mean()), 3),
        "delta_medio": round(float(diff.mean()), 3),
        "delta_ic95": "",
        "cohen_dz": "",
        "rank_biserial": "",
        "wilcoxon_p": "",
    }
    if len(diff) < 2:
        return res
    sd = float(diff.std(ddof=1))
    if sd > 0:
        res["cohen_dz"] = round(float(diff.mean()) / sd, 3)
        half = stats.t.ppf(0.975, len(diff) - 1) * sd / np.sqrt(len(diff))
        res["delta_ic95"] = (
            f"[{round(float(diff.mean() - half), 2)}, "
            f"{round(float(diff.mean() + half), 2)}]"
        )
    if np.any(diff != 0):
        try:
            w = stats.wilcoxon(com, sem)
            res["wilcoxon_p"] = round(float(w.pvalue), 4)
            # rank-biserial pareado: saldo dos ranks a favor do "com judge".
            nz = diff[diff != 0]
            ranks = stats.rankdata(np.abs(nz))
            res["rank_biserial"] = round(
                float((ranks * np.sign(nz)).sum() / ranks.sum()), 3
            )
        except ValueError as e:
            res["wilcoxon_p"] = f"n/a ({e})"
    return res


def rq2_by_topic(agent: pd.DataFrame, form: pd.DataFrame, posts: list[str]):
    """Pareado por tópico (n = tópicos). É o desenho declarado do estudo."""
    overall = human_overall_by_post(form, posts)
    df = agent[["post", "condition", "topic"]].copy()
    df["human_overall"] = df["post"].astype(str).map(overall)
    piv = df.pivot_table(
        index="topic", columns="condition", values="human_overall", aggfunc="mean"
    )
    if not {"com_judge", "sem_judge"}.issubset(piv.columns):
        return piv.reset_index(), {"unidade": "topico", "erro": "faltou uma condição"}
    pair = piv.dropna(subset=["com_judge", "sem_judge"])
    if pair.empty:
        return piv.reset_index(), {
            "unidade": "topico",
            "erro": "nenhum tópico com as duas condições",
        }
    summary = paired_stats(pair["com_judge"].to_numpy(), pair["sem_judge"].to_numpy())
    summary["unidade"] = "topico"
    return piv.reset_index(), summary


def rq2_by_rater(agent: pd.DataFrame, form: pd.DataFrame, posts: list[str]):
    """Pareado por avaliador (n = avaliadores).

    Cada avaliador nota TODOS os posts, então a média com-judge vs sem-judge
    dentro do mesmo avaliador é um par legítimo — e dá muito mais potência que
    os poucos pares por tópico, sem inventar independência que não existe.
    """
    cond_by_post = {str(r["post"]): r["condition"] for _, r in agent.iterrows()}
    com_posts = [p for p in posts if cond_by_post.get(p) == "com_judge"]
    sem_posts = [p for p in posts if cond_by_post.get(p) == "sem_judge"]
    rows = []
    for idx, rater in form.iterrows():

        def mean_of(plist):
            vals = [
                pd.to_numeric(rater.get(f"{p}_overall"), errors="coerce")
                for p in plist
            ]
            vals = [v for v in vals if pd.notna(v)]
            return float(np.mean(vals)) if vals else np.nan

        com, sem = mean_of(com_posts), mean_of(sem_posts)
        if not (np.isnan(com) or np.isnan(sem)):
            rows.append(
                {
                    "rater": str(rater.get("rater_id", idx)),
                    "com_judge": com,
                    "sem_judge": sem,
                    "delta": com - sem,
                }
            )
    table = pd.DataFrame(rows)
    if table.empty:
        return table, {"unidade": "avaliador", "erro": "nenhum avaliador completo"}
    summary = paired_stats(
        table["com_judge"].to_numpy(), table["sem_judge"].to_numpy()
    )
    summary["unidade"] = "avaliador"
    return table, summary


# ───────────────────────── gráficos ─────────────────────────────────────────
def plot_scatter(merged: pd.DataFrame, out_dir: str):
    fig, ax = plt.subplots(figsize=(6, 6))
    for crit in NUMERIC:
        sub = merged[merged["criterio"] == crit]
        if sub.empty:
            continue
        ax.errorbar(
            sub["agent_score"],
            sub["human_mean"],
            yerr=sub["human_std"] if "human_std" in sub else None,
            fmt="o",
            ms=7,
            alpha=0.85,
            capsize=3,
            label=crit,
        )
    ax.plot([0, 10], [0, 10], "k--", lw=1, alpha=0.5, label="concordância perfeita")
    ax.set_xlabel("Nota do agente (Judge)")
    ax.set_ylabel("Nota humana (média +- dp entre avaliadores)")
    ax.set_title("Agente vs humano por critério")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "fig_scatter_agent_vs_human.png"), dpi=130)
    plt.close(fig)


def plot_ab(piv: pd.DataFrame, out_dir: str):
    if not {"com_judge", "sem_judge"}.issubset(piv.columns):
        return
    fig, ax = plt.subplots(figsize=(7, 4))
    x = np.arange(len(piv))
    ax.bar(x - 0.2, piv["sem_judge"], 0.4, label="sem judge")
    ax.bar(x + 0.2, piv["com_judge"], 0.4, label="com judge")
    ax.set_xticks(x)
    ax.set_xticklabels(piv["topic"], rotation=20, ha="right", fontsize=8)
    ax.set_ylabel("Nota humana (overall)")
    ax.set_title("Qualidade percebida: com vs sem judge")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "fig_ab_com_vs_sem.png"), dpi=130)
    plt.close(fig)


def plot_rater_deltas(table: pd.DataFrame, out_dir: str):
    if table.empty:
        return
    fig, ax = plt.subplots(figsize=(7, max(3, 0.28 * len(table))))
    order = table.sort_values("delta")
    ax.barh(np.arange(len(order)), order["delta"], color="#6c8ae4")
    ax.axvline(0, color="k", lw=1)
    ax.set_yticks(np.arange(len(order)))
    ax.set_yticklabels(order["rater"], fontsize=7)
    ax.set_xlabel("Delta nota geral (com judge - sem judge)")
    ax.set_title("Efeito do judge por avaliador")
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "fig_delta_por_avaliador.png"), dpi=130)
    plt.close(fig)


def plot_retest(repeat: pd.DataFrame | None, out_dir: str):
    if repeat is None or repeat.empty or "score" not in repeat.columns:
        return
    posts = sorted(repeat["post"].astype(str).unique())
    data = [
        pd.to_numeric(
            repeat.loc[repeat["post"].astype(str) == p, "score"], errors="coerce"
        )
        .dropna()
        .to_numpy()
        for p in posts
    ]
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.boxplot(data, tick_labels=posts)
    ax.set_xlabel("Post")
    ax.set_ylabel("score do Judge")
    ax.set_title("Estabilidade do juiz: n rodadas no mesmo draft")
    fig.tight_layout()
    fig.savefig(os.path.join(out_dir, "fig_judge_retest.png"), dpi=130)
    plt.close(fig)


# ───────────────────────── demo / dados sintéticos ──────────────────────────
def make_demo(data_dir: str):
    os.makedirs(data_dir, exist_ok=True)
    rng = np.random.default_rng(42)
    topics = ["IA em produto", "Cultura de dados", "Liderança remota"]
    posts = ["A", "B", "C", "D", "E", "F"]
    rows_map, rows_agent, agent_by_post = [], [], {}
    i = 0
    for topic in topics:
        for cond in ("com_judge", "sem_judge"):
            post = posts[i]
            i += 1
            base = 8.0 if cond == "com_judge" else 5.5
            row = {
                "post": post,
                "threadId": f"demo-{post.lower()}",
                "topic": topic,
                "topicKey": topic.lower(),
                "condition": cond,
                "createdAt": "2026-01-01T00:00:00.000Z",
                "status": "awaiting_review",
                "revisionCount": 0,
                "judgeRetries": 1 if cond == "com_judge" else 0,
                "score": round(base + rng.normal(0, 0.4), 1),
                "hookQuality": round(base + rng.normal(0, 0.6), 1),
                "originality": round(base - 0.5 + rng.normal(0, 0.6), 1),
                "scannability": round(base + 0.3 + rng.normal(0, 0.5), 1),
                "ctaQuality": round(base - 0.3 + rng.normal(0, 0.7), 1),
                "lengthAdequate": True,
                "toneLinkedIn": True,
                "hasEngagementBait": cond == "sem_judge",
                "hasExternalLinkInBody": False,
                "charCount": 1500,
                "judgeModel": "gpt-4o",
                "judgeTemperature": 0.1,
                "rubricHash": "demo000000000000",
                "judgedAt": "2026-01-01T00:00:00.000Z",
                "conteudo": f"[demo] post {post} sobre {topic}",
            }
            rows_agent.append(row)
            agent_by_post[post] = row
            rows_map.append(
                {
                    "post": post,
                    "threadId": row["threadId"],
                    "condition": cond,
                    "topic": topic,
                    "topicKey": row["topicKey"],
                }
            )
    pd.DataFrame(rows_agent).to_csv(
        os.path.join(data_dir, "agent-metrics.csv"), index=False
    )
    pd.DataFrame(rows_map).to_csv(os.path.join(data_dir, "mapping.csv"), index=False)

    # 12 avaliadores ruidosos, correlacionados com a nota do agente.
    form_rows = []
    for rater in range(12):
        row = {"rater_id": f"aluno_{rater:02d}"}
        for post in posts:
            ar = agent_by_post[post]
            for crit, acol in AGENT_COL.items():
                v = float(ar[acol]) + rng.normal(0, 1.0)
                row[f"{post}_{crit}"] = float(np.clip(round(v), 0, 10))
            bait = ar["hasEngagementBait"]
            # ~15% de discordância humana, senão o kappa vira 1.0 artificial.
            row[f"{post}_bait"] = (
                ("Sim" if bait else "Não")
                if rng.random() > 0.15
                else ("Não" if bait else "Sim")
            )
            row[f"{post}_link"] = "Não"
        form_rows.append(row)
    pd.DataFrame(form_rows).to_csv(
        os.path.join(data_dir, "form-responses.csv"), index=False
    )

    # Test-retest sintético: 5 rodadas com ruído pequeno (temp 0.1).
    rep_rows = []
    for post in posts:
        ar = agent_by_post[post]
        for run in range(1, 6):
            rep_rows.append(
                {
                    "post": post,
                    "threadId": ar["threadId"],
                    "condition": ar["condition"],
                    "run": run,
                    **{
                        acol: float(
                            np.clip(round(float(ar[acol]) + rng.normal(0, 0.5)), 0, 10)
                        )
                        for acol in AGENT_COL.values()
                    },
                    "lengthAdequate": True,
                    "toneLinkedIn": True,
                    "hasEngagementBait": ar["hasEngagementBait"],
                    "hasExternalLinkInBody": False,
                    "judgeModel": "gpt-4o",
                    "judgeTemperature": 0.1,
                    "rubricHash": "demo000000000000",
                    "judgedAt": "2026-01-01T00:00:00.000Z",
                }
            )
    pd.DataFrame(rep_rows).to_csv(
        os.path.join(data_dir, "judge-repeat.csv"), index=False
    )
    print(f"[demo] dados sintéticos escritos em {data_dir}")


# ───────────────────────── main ─────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--demo", action="store_true", help="gera dados sintéticos e roda")
    args = ap.parse_args()

    # O --demo escreve num diretório separado de propósito: rodar a demo nunca
    # pode sobrescrever a coleta real que está em study/data/.
    default_data = os.path.join(HERE, "..", "data", "demo" if args.demo else "")
    default_out = os.path.join(HERE, "out", "demo" if args.demo else "")
    data_dir = os.path.abspath(args.data_dir or default_data)
    out_dir = os.path.abspath(args.out_dir or default_out)
    os.makedirs(out_dir, exist_ok=True)

    if args.demo:
        make_demo(data_dir)

    try:
        agent, form, mapping, repeat = load_inputs(data_dir)
    except FileNotFoundError as e:
        print(f"ERRO: faltou arquivo de entrada em {data_dir}\n  {e}")
        print("Dica: rode com --demo para testar o pipeline com dados sintéticos.")
        sys.exit(1)

    posts = posts_in(agent)
    check_mapping(agent, mapping)
    check_provenance(agent)
    log(f"Amostra: {len(posts)} posts ({', '.join(posts)}) · {len(form)} avaliadores")
    if repeat is None:
        log(
            "judge-repeat.csv ausente — sem confiabilidade intra-juiz (RQ1d) e a "
            "nota do agente vem de UMA execução."
        )
    else:
        runs = repeat["run"].nunique() if "run" in repeat.columns else "?"
        log(f"Nota do agente = MEDIANA de {runs} rodadas (judge-repeat.csv).")
    log()

    merged = agent_long(agent, posts, repeat).merge(
        human_long(form, posts), on=["post", "criterio"], how="inner"
    )
    if merged.empty:
        print(
            "ERRO: nenhum cruzamento agente x humano.\n"
            "  Confira se as colunas do form seguem <POST>_<criterio> "
            f"para os posts {posts}."
        )
        sys.exit(1)

    rq1 = rq1_agreement(merged)
    flags = rq1_flags(agent, form, posts, repeat)
    reliability = human_reliability(form, posts)
    retest = judge_retest(repeat)
    piv, rq2_topic = rq2_by_topic(agent, form, posts)
    rater_table, rq2_rater = rq2_by_rater(agent, form, posts)

    log("=== RQ1a — concordância agente x humano (critérios 0-10) ===")
    log(rq1.to_string(index=False))
    log()
    log("=== RQ1b — flags booleanas (Cohen's kappa) ===")
    log(
        flags.to_string(index=False)
        if not flags.empty
        else "(sem colunas de flag no form)"
    )
    log()
    log("=== RQ1c — confiabilidade ENTRE humanos (piso de comparação) ===")
    log(
        reliability.to_string(index=False)
        if not reliability.empty
        else "(avaliadores insuficientes)"
    )
    log()
    log("=== RQ1d — test-retest do juiz (teto de comparação) ===")
    log(retest.to_string(index=False) if not retest.empty else "(sem judge-repeat.csv)")
    log()
    log("=== RQ2 — efeito do judge, pareado por TÓPICO ===")
    log(piv.to_string(index=False))
    for k, v in rq2_topic.items():
        log(f"  {k}: {v}")
    log()
    log("=== RQ2 — efeito do judge, pareado por AVALIADOR ===")
    for k, v in rq2_rater.items():
        log(f"  {k}: {v}")
    log()
    log(
        "Leitura: com n pequeno o p-valor é frágil — reporte delta, IC95 e "
        "dz/rank-biserial. A concordância do juiz (RQ1a) só significa algo se "
        "lida contra o ICC entre humanos (RQ1c) e a estabilidade do próprio "
        "juiz (RQ1d)."
    )

    rq1.to_csv(os.path.join(out_dir, "rq1_agreement.csv"), index=False)
    flags.to_csv(os.path.join(out_dir, "rq1_flags_kappa.csv"), index=False)
    reliability.to_csv(os.path.join(out_dir, "human_reliability.csv"), index=False)
    if not retest.empty:
        retest.to_csv(os.path.join(out_dir, "judge_retest.csv"), index=False)
    pd.DataFrame([rq2_topic, rq2_rater]).to_csv(
        os.path.join(out_dir, "rq2_ab.csv"), index=False
    )
    piv.to_csv(os.path.join(out_dir, "rq2_por_topico.csv"), index=False)
    if not rater_table.empty:
        rater_table.to_csv(os.path.join(out_dir, "rq2_por_avaliador.csv"), index=False)
    with open(os.path.join(out_dir, "summary.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(_LOG))

    plot_scatter(merged, out_dir)
    plot_ab(piv, out_dir)
    plot_rater_deltas(rater_table, out_dir)
    plot_retest(repeat, out_dir)
    print(f"\nSaídas escritas em {out_dir}")


if __name__ == "__main__":
    main()
