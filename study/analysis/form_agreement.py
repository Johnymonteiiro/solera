"""Concordância Critic × humanos no formulário real (ICAART 2027).

    python study/analysis/form_agreement.py

Entradas (study/data/):
  form-responses.xlsx   export do Google Forms, como veio (1ª aba)
  critic-scores.csv     `pnpm study:critic-form` — a nota do Critic que vale
  critic-repeat.csv     `pnpm study:critic-form --repeat 5 --go` (opcional)

Saídas:
  study/artigo-icaart-2027/tables/*.tex   tabelas e macros que o artigo inclui
  study/analysis/out/form/results.json    todos os números, para conferência

Por que o Critic vem do CSV e não da 2ª aba da planilha: a aba foi digitada à
mão e diverge do banco no post D (4,3,4,3,3 na aba; 4,4,4,4,4 gravado). O script
compara as duas e avisa.

Nenhum número do artigo deve ser digitado: o .tex lê as macros daqui.
"""

from __future__ import annotations

import json
import re
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "study" / "data"
TABLES = ROOT / "study" / "artigo-icaart-2027" / "tables"
OUT = ROOT / "study" / "analysis" / "out" / "form"

DIMS = ["clarity", "relevance", "professional", "engagement", "overall"]
DIM_EN = {
    "clarity": "Clarity and Readability",
    "relevance": "Relevance and Informational Value",
    "professional": "Professional Appropriateness",
    "engagement": "Engagement Quality",
    "overall": "Overall Quality",
}
FOUR = DIMS[:4]
SCALE = np.arange(1, 6)
B = 2000
SEED = 20260913

# Tópicos traduzidos para o apêndice. O original (pt-BR) é o que foi mostrado.
TOPIC_EN = {
    "A": "What is technical debt and how can it be explained to non-technical people?",
    "J": "Junior programmers will no longer be hired from 2027 onwards",
    "D": "Legacy code that nobody wants to touch and nobody manages to replace",
    "L": "Why do retrospective meetings change nothing?",
    "F": "Technical certifications have lost value in hiring processes",
    "P": "A college degree is no longer of any use in the job market",
    "I": "Artificial intelligence will transform the future of work",
    "E": "How to double a development team's productivity in 30 days?",
    "H": "What is the future of programming?",
    "C": "Daily stand-up meetings have become an empty ritual in most tech teams",
}


# ─── Carga ───────────────────────────────────────────────────────────────────


def load():
    xls = pd.ExcelFile(DATA / "form-responses.xlsx")
    form = xls.parse(xls.sheet_names[0])
    critic = pd.read_csv(DATA / "critic-scores.csv")
    posts = critic.sort_values("formOrder")["post"].tolist()

    H = np.full((len(form), len(posts), len(DIMS)), np.nan)
    for col in form.columns[1:]:
        m = re.search(r"\[([A-Z])(\d)\]", str(col))
        if not m:
            raise ValueError(f"coluna sem código [X#]: {col!r}")
        H[:, posts.index(m.group(1)), int(m.group(2)) - 1] = form[col].to_numpy(float)
    if np.isnan(H).any():
        raise ValueError("há nota faltando — o pré-registro manda inutilizar o item, não imputar")
    H = H.astype(int)
    C = critic.set_index("post").loc[posts, DIMS].to_numpy(int)

    # Conferência contra a aba digitada à mão.
    divergencias = []
    if len(xls.sheet_names) > 1:
        aba = xls.parse(xls.sheet_names[1]).set_index("post")
        aba.columns = [c.lower() for c in aba.columns]
        aba = aba.rename(columns={"geral": "overall"})
        for i, p in enumerate(posts):
            v = aba.loc[p, DIMS].to_numpy(int)
            if not np.array_equal(v, C[i]):
                divergencias.append({"post": p, "planilha": v.tolist(), "banco": C[i].tolist()})
    return form, critic, posts, H, C, divergencias


# ─── Medidas ─────────────────────────────────────────────────────────────────


def pair_counts(col: np.ndarray, weights: np.ndarray | None = None):
    """Pares humano–humano de UM post: (pares, exatos, ±1), descontando pares de
    um avaliador consigo mesmo quando o bootstrap o sorteia duas vezes."""
    counts = np.bincount(col, minlength=6)[1:]
    dup = 0 if weights is None else int((weights * (weights - 1) // 2).sum())
    n = len(col)
    pairs = n * (n - 1) // 2 - dup
    exact = int((counts * (counts - 1) // 2).sum()) - dup
    within = exact + int((counts[:-1] * counts[1:]).sum())
    return pairs, exact, within


def hh_agreement(Hd: np.ndarray, rater_mult: np.ndarray | None = None):
    """Hd: avaliadores × posts. Concordância exata e ±1 sobre todos os pares."""
    P = E = W = 0
    for j in range(Hd.shape[1]):
        p, e, w = pair_counts(Hd[:, j], rater_mult)
        P, E, W = P + p, E + e, W + w
    return E / P, W / P, P


def ch_agreement(Hd: np.ndarray, Cd: np.ndarray):
    diff = np.abs(Hd - Cd[None, :])
    return (diff == 0).mean(), (diff <= 1).mean(), diff.mean(), diff.size


def marginal(v: np.ndarray):
    return np.bincount(v.ravel(), minlength=6)[1:] / v.size


def chance(p: np.ndarray, q: np.ndarray):
    """Acordo esperado se as duas fontes fossem independentes com essas distribuições."""
    exact = float((p * q).sum())
    within = exact + float((p[:-1] * q[1:]).sum() + (p[1:] * q[:-1]).sum())
    return exact, within


def weighted_kappa(a: np.ndarray, b: np.ndarray):
    """κ de Cohen com peso quadrático, categorias 1–5."""
    O = np.zeros((5, 5))
    for x, y in zip(a.ravel(), b.ravel()):
        O[x - 1, y - 1] += 1
    O /= O.sum()
    Ex = np.outer(O.sum(1), O.sum(0))
    i, j = np.meshgrid(SCALE, SCALE, indexing="ij")
    w = (i - j) ** 2 / 16
    den = (w * Ex).sum()
    return float("nan") if den == 0 else float(1 - (w * O).sum() / den)


def kripp_alpha_ordinal(Hd: np.ndarray):
    """α de Krippendorff, métrica ordinal. Hd: avaliadores × unidades, sem faltas."""
    o = np.zeros((5, 5))
    for j in range(Hd.shape[1]):
        vals = Hd[:, j]
        m = len(vals)
        cnt = np.bincount(vals, minlength=6)[1:]
        pair = np.outer(cnt, cnt) - np.diag(cnt)
        o += pair / (m - 1)
    n_c = o.sum(1)
    n = n_c.sum()
    d2 = np.zeros((5, 5))
    for c in range(5):
        for k in range(5):
            lo, hi = min(c, k), max(c, k)
            d2[c, k] = (n_c[lo : hi + 1].sum() - (n_c[c] + n_c[k]) / 2) ** 2
    den = (np.outer(n_c, n_c) * d2).sum()
    return float("nan") if den == 0 else float(1 - (n - 1) * (o * d2).sum() / den)


def describe(H: np.ndarray, C: np.ndarray, posts: list[str]):
    res = {}
    for d, dim in enumerate(DIMS):
        Hd, Cd = H[:, :, d], C[:, d]
        hh_ex, hh_w, hh_pairs = hh_agreement(Hd)
        ch_ex, ch_w, mae, ch_n = ch_agreement(Hd, Cd)
        ph, pc = marginal(Hd), marginal(Cd)
        chance_ch = chance(pc, ph)
        chance_hh = chance(ph, ph)
        mode = int(np.argmax(np.bincount(Hd.ravel(), minlength=6)))
        const_ex, const_w, _, _ = ch_agreement(Hd, np.full_like(Cd, mode))
        post_means = Hd.mean(0)
        # Decomposição de soma de quadrados (visão intervalar, dois fatores sem
        # interação): quanto da variação humana é avaliador e quanto é post.
        Y = Hd.astype(float)
        gm = Y.mean()
        ss_t = ((Y - gm) ** 2).sum()
        var_rater = Y.shape[1] * ((Y.mean(1) - gm) ** 2).sum() / ss_t
        var_post = Y.shape[0] * ((post_means - gm) ** 2).sum() / ss_t
        rho =spearmanr(Cd, post_means).correlation if np.ptp(Cd) > 0 else float("nan")
        per_rater_kappa = [weighted_kappa(np.array(Cd), Hd[r]) for r in range(Hd.shape[0])]
        res[dim] = {
            "hh_exact": hh_ex, "hh_within1": hh_w, "hh_pairs": hh_pairs,
            "ch_exact": ch_ex, "ch_within1": ch_w, "ch_comparisons": ch_n,
            "chance_ch_exact": chance_ch[0], "chance_ch_within1": chance_ch[1],
            "chance_hh_exact": chance_hh[0], "chance_hh_within1": chance_hh[1],
            "human_mode": mode, "const_mode_exact": const_ex, "const_mode_within1": const_w,
            "human_mean": float(Hd.mean()), "human_sd": float(Hd.std(ddof=1)),
            "human_post_mean_sd": float(post_means.std(ddof=1)),
            "var_share_rater": float(var_rater), "var_share_post": float(var_post),
            "human_post_means": dict(zip(posts, map(float, post_means))),
            "critic_mean": float(Cd.mean()), "critic_sd": float(Cd.std(ddof=1)),
            "critic_distinct": int(len(set(Cd.tolist()))),
            "bias": float((Cd[None, :] - Hd).mean()), "mae": float(mae),
            "kappa_w_pooled": weighted_kappa(np.repeat(Cd[None, :], Hd.shape[0], 0), Hd),
            "kappa_w_rater_mean": float(np.nanmean(per_rater_kappa)) if not np.all(np.isnan(per_rater_kappa)) else float("nan"),
            "spearman_post": float(rho),
            "alpha_humans": kripp_alpha_ordinal(Hd),
            "human_dist": marginal(Hd).tolist(), "critic_dist": marginal(Cd).tolist(),
        }
    four = {k: float(np.mean([res[d][k] for d in FOUR])) for k in
            ["hh_exact", "hh_within1", "ch_exact", "ch_within1", "chance_ch_exact",
             "chance_ch_within1", "chance_hh_exact", "chance_hh_within1",
             "const_mode_exact", "const_mode_within1", "mae"]}
    res["four"] = four
    return res


def bootstrap(H: np.ndarray, C: np.ndarray):
    """Dois sentidos: posts E avaliadores reamostrados. α só por posts (duplicar
    avaliador infla α artificialmente)."""
    rng = np.random.default_rng(SEED)
    nr, npost, _ = H.shape
    keys = ["ch_exact", "ch_within1", "hh_exact", "hh_within1", "diff_exact", "diff_within1",
            "ch_minus_chance_exact", "ch_minus_chance_within1",
            "hh_minus_chance_exact", "hh_minus_chance_within1"]
    draws = {k: [] for k in keys}
    per_dim = {d: {"bias": [], "alpha": [], "kappa": []} for d in DIMS}
    for _ in range(B):
        pi = rng.integers(0, npost, npost)
        ri = rng.integers(0, nr, nr)
        mult = np.bincount(ri, minlength=nr)[ri]  # quantas vezes cada linha sorteada aparece
        # pares duplicados: desconta por avaliador distinto, não por linha
        uniq, t = np.unique(ri, return_counts=True)
        acc = {k: [] for k in keys}
        for d, dim in enumerate(DIMS):
            Hd = H[ri][:, pi, d]
            Cd = C[pi, d]
            P = E = W = 0
            for j in range(npost):
                p, e, w = pair_counts(Hd[:, j])
                dup = int((t * (t - 1) // 2).sum())
                P, E, W = P + p - dup, E + e - dup, W + w - dup
            hh_ex, hh_w = E / P, W / P
            ch_ex, ch_w, _, _ = ch_agreement(Hd, Cd)
            ce, cw = chance(marginal(Cd), marginal(Hd))
            he, hw = chance(marginal(Hd), marginal(Hd))
            if dim in FOUR:
                vals = [ch_ex, ch_w, hh_ex, hh_w, ch_ex - hh_ex, ch_w - hh_w, ch_ex - ce, ch_w - cw,
                        hh_ex - he, hh_w - hw]
                for k, v in zip(keys, vals):
                    acc[k].append(v)
            per_dim[dim]["bias"].append(float((Cd[None, :] - Hd).mean()))
            per_dim[dim]["kappa"].append(weighted_kappa(np.repeat(Cd[None, :], nr, 0), Hd))
            per_dim[dim]["alpha"].append(kripp_alpha_ordinal(H[:, pi, d]))
        for k in keys:
            draws[k].append(float(np.mean(acc[k])))
        del mult
    ci = lambda a: [float(np.nanpercentile(a, 2.5)), float(np.nanpercentile(a, 97.5))]
    out = {k: ci(v) for k, v in draws.items()}
    out["per_dim"] = {d: {k: ci(v) for k, v in per_dim[d].items()} for d in DIMS}
    return out


def critic_repeat(C: np.ndarray, posts: list[str]):
    f = DATA / "critic-repeat.csv"
    if not f.exists():
        return None
    rep = pd.read_csv(f)
    orig = rep[rep.condition == "original"]
    trunc = rep[rep.condition != "original"]
    res = {"runs_per_post": int(orig.groupby("post").size().min()), "n_calls": int(len(rep)), "dims": {}}
    for d, dim in enumerate(DIMS):
        g = orig.groupby("post")[dim]
        stored = dict(zip(posts, C[:, d]))
        same_as_stored = np.mean([(orig[orig.post == p][dim] == stored[p]).mean() for p in posts])
        unanimous = np.mean([g.get_group(p).nunique() == 1 for p in posts])
        res["dims"][dim] = {
            "mean_within_post_sd": float(g.std(ddof=1).mean()),
            "share_runs_equal_stored": float(same_as_stored),
            "share_posts_unanimous": float(unanimous),
            "run_distribution": marginal(orig[dim].to_numpy(int)).tolist(),
        }
    flips = orig.groupby("post")["decision"].nunique().gt(1).sum()
    res["posts_with_decision_flip"] = int(flips)
    res["accept_rate_original"] = float((orig.decision == "ACCEPT").mean())
    if len(trunc):
        res["truncated"] = {
            "n": int(len(trunc)),
            "reject_rate": float((trunc.decision == "REJECT").mean()),
            "mean_scores": {dim: float(trunc[dim].mean()) for dim in DIMS},
            "mean_scores_original": {dim: float(orig[dim].mean()) for dim in DIMS},
        }
    return res


# ─── Saída LaTeX ─────────────────────────────────────────────────────────────


def pct(x):
    return "--" if x is None or np.isnan(x) else f"{100 * x:.1f}\\%"


def num(x, nd=2, sign=False):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "n/a"
    if round(x, nd) == 0:
        x = 0.0  # evita "-0.00"
    s = f"{x:+.{nd}f}" if sign else f"{x:.{nd}f}"
    return s.replace("-", "$-$") if s.startswith("-") else s


def write_tables(r, boot, sens, rep, posts, critic, H, C, divergencias, n_raters, flagged):
    TABLES.mkdir(parents=True, exist_ok=True)
    f4 = r["four"]

    rows = []
    for dim in FOUR + ["overall"]:
        x = r[dim]
        if dim == "overall":
            rows.append("\\midrule")
        rows.append(
            f"{DIM_EN[dim]} & {pct(x['hh_exact'])} & {pct(x['hh_within1'])} & "
            f"{pct(x['ch_exact'])} & {pct(x['ch_within1'])} & "
            f"{pct(x['chance_ch_exact'])} & {pct(x['chance_ch_within1'])} \\\\"
        )
        if dim == "engagement":
            rows.append("\\midrule")
            rows.append(
                f"\\textbf{{Four dimensions}} & \\textbf{{{pct(f4['hh_exact'])}}} & \\textbf{{{pct(f4['hh_within1'])}}} & "
                f"\\textbf{{{pct(f4['ch_exact'])}}} & \\textbf{{{pct(f4['ch_within1'])}}} & "
                f"\\textbf{{{pct(f4['chance_ch_exact'])}}} & \\textbf{{{pct(f4['chance_ch_within1'])}}} \\\\"
            )
            rows.append(
                f"\\quad 95\\% CI & {pct(boot['hh_exact'][0])}--{pct(boot['hh_exact'][1])} & "
                f"{pct(boot['hh_within1'][0])}--{pct(boot['hh_within1'][1])} & "
                f"{pct(boot['ch_exact'][0])}--{pct(boot['ch_exact'][1])} & "
                f"{pct(boot['ch_within1'][0])}--{pct(boot['ch_within1'][1])} & & \\\\"
            )
    (TABLES / "agreement.tex").write_text(
        "\\begin{tabular}{lcccccc}\n\\toprule\n"
        " & \\multicolumn{2}{c}{Human--Human} & \\multicolumn{2}{c}{Critic--Human} & \\multicolumn{2}{c}{Chance (Critic--Human)} \\\\\n"
        "\\cmidrule(lr){2-3}\\cmidrule(lr){4-5}\\cmidrule(lr){6-7}\n"
        "Dimension & Exact & $\\pm1$ & Exact & $\\pm1$ & Exact & $\\pm1$ \\\\\n\\midrule\n"
        + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n",
        encoding="utf-8",
    )

    rows = []
    for dim in DIMS:
        x = r[dim]
        if dim == "overall":
            rows.append("\\midrule")
        bci = boot["per_dim"][dim]["bias"]
        rows.append(
            f"{DIM_EN[dim]} & {num(x['human_mean'])} ({num(x['human_sd'])}) & {num(x['critic_mean'])} ({num(x['critic_sd'])}) & "
            f"{num(x['bias'], sign=True)} [{num(bci[0], sign=True)}, {num(bci[1], sign=True)}] & {num(x['mae'])} & "
            f"{num(x['kappa_w_pooled'])} & {num(x['spearman_post'])} & {num(x['alpha_humans'])} \\\\"
        )
    (TABLES / "scores.tex").write_text(
        "\\begin{tabular}{lccccccc}\n\\toprule\n"
        "Dimension & Human $M$ ($SD$) & Critic $M$ ($SD$) & Bias [95\\% CI] & MAE & $\\kappa_w$ & $\\rho$ & $\\alpha_H$ \\\\\n\\midrule\n"
        + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n",
        encoding="utf-8",
    )

    rows = []
    for dim in DIMS:
        h = r[dim]["human_dist"]
        c = r[dim]["critic_dist"]
        cells = " & ".join(f"{100*a:.0f} / {100*b:.0f}" for a, b in zip(h, c))
        rows.append(f"{DIM_EN[dim]} & {cells} \\\\")
    (TABLES / "distribution.tex").write_text(
        "\\begin{tabular}{lccccc}\n\\toprule\n"
        "Dimension & 1 & 2 & 3 & 4 & 5 \\\\\n\\midrule\n"
        + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n",
        encoding="utf-8",
    )

    crit = critic.set_index("post")
    rows = []
    for i, p in enumerate(posts):
        hm = " & ".join(num(float(H[:, i, d].mean()), 1) for d in range(5))
        cv = ",".join(str(v) for v in C[i])
        rows.append(f"{p} & {TOPIC_EN[p]} & {int(crit.loc[p, 'charCount'])} & {cv} & {hm} \\\\")
    (TABLES / "posts.tex").write_text(
        "\\begin{tabular}{lp{6.2cm}rlccccc}\n\\toprule\n"
        " & & & & \\multicolumn{5}{c}{Human mean} \\\\\n\\cmidrule(lr){5-9}\n"
        "Post & Requested topic (translated) & Chars & Critic & Cl. & Rel. & Prof. & Eng. & Ov. \\\\\n\\midrule\n"
        + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n",
        encoding="utf-8",
    )

    if rep:
        rows = []
        for dim in DIMS:
            x = rep["dims"][dim]
            rows.append(
                f"{DIM_EN[dim]} & {num(x['mean_within_post_sd'])} & {pct(x['share_runs_equal_stored'])} & {pct(x['share_posts_unanimous'])} \\\\"
            )
        (TABLES / "repeat.tex").write_text(
            "\\begin{tabular}{lccc}\n\\toprule\n"
            "Dimension & Within-post $SD$ & Runs = reported score & Posts with identical runs \\\\\n\\midrule\n"
            + "\n".join(rows) + "\n\\bottomrule\n\\end{tabular}\n",
            encoding="utf-8",
        )

    # Macros: todo número citado no texto passa por aqui.
    m = {}
    m["NRaters"] = str(n_raters)
    m["NPosts"] = str(len(posts))
    m["NCHperDim"] = f"{r['clarity']['ch_comparisons']:,}"
    m["NHHperDim"] = f"{r['clarity']['hh_pairs']:,}"
    for k, name in [("hh_exact", "HHex"), ("hh_within1", "HHw"), ("ch_exact", "CHex"), ("ch_within1", "CHw"),
                    ("chance_ch_exact", "CHchanceEx"), ("chance_ch_within1", "CHchanceW"),
                    ("const_mode_exact", "ConstEx"), ("const_mode_within1", "ConstW")]:
        m[name + "All"] = pct(f4[k])
    for k, name in [("ch_exact", "CHex"), ("ch_within1", "CHw"), ("hh_exact", "HHex"), ("hh_within1", "HHw")]:
        m[name + "Lo"], m[name + "Hi"] = pct(boot[k][0]), pct(boot[k][1])
    m["DiffExLo"], m["DiffExHi"] = num(100 * boot["diff_exact"][0], 1, True), num(100 * boot["diff_exact"][1], 1, True)
    m["DiffWLo"], m["DiffWHi"] = num(100 * boot["diff_within1"][0], 1, True), num(100 * boot["diff_within1"][1], 1, True)
    m["ChanceDiffExLo"], m["ChanceDiffExHi"] = num(100 * boot["ch_minus_chance_exact"][0], 1, True), num(100 * boot["ch_minus_chance_exact"][1], 1, True)
    m["ChanceDiffWLo"], m["ChanceDiffWHi"] = num(100 * boot["ch_minus_chance_within1"][0], 1, True), num(100 * boot["ch_minus_chance_within1"][1], 1, True)
    m["HHchanceExAll"], m["HHchanceWAll"] = pct(f4["chance_hh_exact"]), pct(f4["chance_hh_within1"])
    m["HHChanceDiffExLo"], m["HHChanceDiffExHi"] = num(100 * boot["hh_minus_chance_exact"][0], 1, True), num(100 * boot["hh_minus_chance_exact"][1], 1, True)
    m["HHChanceDiffWLo"], m["HHChanceDiffWHi"] = num(100 * boot["hh_minus_chance_within1"][0], 1, True), num(100 * boot["hh_minus_chance_within1"][1], 1, True)
    tag = {"clarity": "Cla", "relevance": "Rel", "professional": "Pro", "engagement": "Eng", "overall": "Ove"}
    for dim in DIMS:
        x, t = r[dim], tag[dim]
        m[f"HumMean{t}"] = num(x["human_mean"])
        m[f"CriMean{t}"] = num(x["critic_mean"])
        m[f"Bias{t}"] = num(x["bias"], sign=True)
        m[f"BiasLo{t}"], m[f"BiasHi{t}"] = (num(v, sign=True) for v in boot["per_dim"][dim]["bias"])
        m[f"MAE{t}"] = num(x["mae"])
        m[f"Kappa{t}"] = num(x["kappa_w_pooled"])
        m[f"Rho{t}"] = num(x["spearman_post"])
        m[f"Alpha{t}"] = num(x["alpha_humans"])
        m[f"AlphaLo{t}"], m[f"AlphaHi{t}"] = (num(v) for v in boot["per_dim"][dim]["alpha"])
        m[f"CHex{t}"] = pct(x["ch_exact"])
        m[f"HHex{t}"] = pct(x["hh_exact"])
        m[f"CriDistinct{t}"] = str(x["critic_distinct"])
        m[f"PostMeanSD{t}"] = num(x["human_post_mean_sd"])
        m[f"HumMode{t}"] = str(x["human_mode"])
        m[f"VarPost{t}"] = f"{100 * x['var_share_post']:.0f}\\%"
        m[f"VarRater{t}"] = f"{100 * x['var_share_rater']:.0f}\\%"
    m["VarPostMin"] = f"{100 * min(r[d]['var_share_post'] for d in DIMS):.0f}\\%"
    m["VarPostMax"] = f"{100 * max(r[d]['var_share_post'] for d in DIMS):.0f}\\%"
    m["VarRaterMin"] = f"{100 * min(r[d]['var_share_rater'] for d in DIMS):.0f}\\%"
    m["VarRaterMax"] = f"{100 * max(r[d]['var_share_rater'] for d in DIMS):.0f}\\%"
    m["AlphaMin"] = num(min(r[d]["alpha_humans"] for d in DIMS))
    m["AlphaMax"] = num(max(r[d]["alpha_humans"] for d in DIMS))
    m["FlaggedN"] = str(len(flagged))
    m["PostMeanMin"] = num(min(min(r[d]["human_post_means"].values()) for d in FOUR))
    m["PostMeanMax"] = num(max(max(r[d]["human_post_means"].values()) for d in FOUR))
    m["SensCHexAll"] = pct(sens["four"]["ch_exact"])
    m["SensHHexAll"] = pct(sens["four"]["hh_exact"])
    m["SensCHwAll"] = pct(sens["four"]["ch_within1"])
    m["SensChanceExAll"] = pct(sens["four"]["chance_ch_exact"])
    for dim in DIMS:
        m[f"SensBias{tag[dim]}"] = num(sens[dim]["bias"], sign=True)
        m[f"SensAlpha{tag[dim]}"] = num(sens[dim]["alpha_humans"])
    # Composto da regra de aceitação (pesos de rubric.ts), por post.
    comp = (35 * C[:, 0] + 35 * C[:, 1] + 15 * C[:, 2] + 15 * C[:, 3]) / 100
    m["CompAtThreshold"] = str(int((np.abs(comp - 3.5) < 1e-9).sum()))
    m["CompMin"], m["CompMax"] = num(float(comp.min())), num(float(comp.max()))
    m["CharMin"] = str(int(critic.charCount.min()))
    m["CharMax"] = str(int(critic.charCount.max()))
    if rep:
        m["RepRuns"] = str(rep["runs_per_post"])
        m["RepCalls"] = str(rep["n_calls"])
        m["RepFlips"] = str(rep["posts_with_decision_flip"])
        m["RepAccept"] = pct(rep["accept_rate_original"])
        for dim in DIMS:
            m[f"RepEqual{tag[dim]}"] = pct(rep["dims"][dim]["share_runs_equal_stored"])
            m[f"RepUnan{tag[dim]}"] = pct(rep["dims"][dim]["share_posts_unanimous"])
            m[f"RepSD{tag[dim]}"] = num(rep["dims"][dim]["mean_within_post_sd"])
        if "truncated" in rep:
            m["TruncReject"] = pct(rep["truncated"]["reject_rate"])
            m["TruncN"] = str(rep["truncated"]["n"])
            for dim in DIMS:
                m[f"TruncMean{tag[dim]}"] = num(rep["truncated"]["mean_scores"][dim])
                m[f"RepMean{tag[dim]}"] = num(rep["truncated"]["mean_scores_original"][dim])

    lines = ["% GERADO por study/analysis/form_agreement.py — não editar à mão."]
    for k, v in m.items():
        if not re.fullmatch(r"[A-Za-z]+", k):
            raise ValueError(f"nome de macro inválido: {k}")
        lines.append(f"\\newcommand{{\\{k}}}{{{v}}}")
    (TABLES / "macros.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return m


def main():
    form, critic, posts, H, C, divergencias = load()
    n_raters = H.shape[0]

    # Sensibilidade — critério definido ao olhar os dados, portanto só secundário:
    # avaliadores com metade ou mais das notas no mínimo da escala.
    floor_share = (H == 1).reshape(n_raters, -1).mean(1)
    flagged = [int(i) for i in np.where(floor_share >= 0.5)[0]]
    keep = [i for i in range(n_raters) if i not in flagged]

    r = describe(H, C, posts)
    sens = describe(H[keep], C, posts)
    boot = bootstrap(H, C)
    rep = critic_repeat(C, posts)

    macros = write_tables(r, boot, sens, rep, posts, critic, H, C, divergencias, n_raters, flagged)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(
        json.dumps({"divergencias_planilha_banco": divergencias, "flagged_raters_row0": flagged,
                    "flagged_floor_share": [float(floor_share[i]) for i in flagged],
                    "main": r, "sensitivity_without_flagged": sens, "bootstrap": boot,
                    "critic_repeat": rep, "macros": macros}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"posts {len(posts)} · avaliadores {n_raters} · comparações C–H/dim {r['clarity']['ch_comparisons']} · pares H–H/dim {r['clarity']['hh_pairs']}")
    if divergencias:
        print("ATENÇÃO — aba do Critic na planilha diverge do banco (vale o banco):", divergencias)
    print(f"avaliadores sinalizados (≥50% das notas = 1): linhas {flagged}")
    hdr = f"{'dim':13s} {'HHex':>6s} {'HHw':>6s} {'CHex':>6s} {'CHw':>6s} {'chEx':>6s} {'chW':>6s} {'bias':>6s} {'MAE':>5s} {'kw':>6s} {'rho':>6s} {'alpha':>6s}"
    print(hdr)
    for dim in DIMS + ["four"]:
        x = r[dim]
        g = lambda k: x.get(k, float("nan"))
        print(f"{dim:13s} {100*g('hh_exact'):6.1f} {100*g('hh_within1'):6.1f} {100*g('ch_exact'):6.1f} {100*g('ch_within1'):6.1f} "
              f"{100*g('chance_ch_exact'):6.1f} {100*g('chance_ch_within1'):6.1f} {g('bias'):6.2f} {g('mae'):5.2f} "
              f"{g('kappa_w_pooled'):6.2f} {g('spearman_post'):6.2f} {g('alpha_humans'):6.2f}")
    print("bootstrap 95%:", {k: [round(100 * v, 1) for v in boot[k]] for k in boot if k != "per_dim"})
    print("alpha CI:", {d: [round(v, 2) for v in boot["per_dim"][d]["alpha"]] for d in DIMS})
    print("sens four:", {k: round(100 * v, 1) for k, v in sens["four"].items() if k != "mae"})
    if rep:
        print("critic repeat:", json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()
