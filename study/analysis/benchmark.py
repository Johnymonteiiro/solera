"""Benchmark de escritores sob o mesmo Critic (ICAART 2027, RQ4).

    python study/analysis/benchmark.py

Entradas (study/data/):
  benchmark-scores.csv   `pnpm study:benchmark --go` — 40 linhas:
                         GPT (juiz antigo, gravado) + GPT, Claude e Gemini (juiz atual)
  form-responses.xlsx    respostas humanas (só para a correlação com o GPT)
  critic-scores.csv      ordem/letras dos posts do formulário

Saídas:
  study/artigo-icaart-2027/tables/benchmark_macros.tex   macros \\Bm...
  study/artigo-icaart-2027/tables/benchmark.tex          tabela (a versão em números da figura)
  study/artigo-icaart-2027/tables/benchmark_fig.tex      figura pgfplots (TikZ)
  study/analysis/out/benchmark/results.json

Arquivos separados dos do form_agreement.py de propósito: aquele script
reescreve macros.tex inteiro, e as duas análises têm entradas diferentes.
Nenhum número do artigo deve ser digitado: o .tex lê as macros daqui.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from form_agreement import load as load_form

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "study" / "data"
TABLES = ROOT / "study" / "artigo-icaart-2027" / "tables"
OUT = ROOT / "study" / "analysis" / "out" / "benchmark"

FOUR = ["clarity", "relevance", "professional", "engagement"]
DIMS = FOUR + ["overall"]
WEIGHTS = {"clarity": 0.35, "relevance": 0.35, "professional": 0.15, "engagement": 0.15}  # lib/rubric.ts
THRESHOLD = 3.5
B = 2000
SEED = 20260918

# Série do gráfico: rótulo, cor (paleta da skill dataviz, modo claro, validada
# contra branco: 3 cores all-pairs), marcador. GPT com o juiz antigo é contexto,
# não série categórica: cinza e marcador vazado.
SERIES = {
    "gpt_old": ("GPT-4o/4o-mini (original prompt)", "benchGray", "o", "draw=benchGray, fill=white"),
    "gpt": ("GPT-4o/4o-mini", "benchBlue", "*", "draw=white, fill=benchBlue"),
    "claude": ("Claude Sonnet 5", "benchOrange", "square*", "draw=white, fill=benchOrange"),
    "gemini": ("Gemini 3.8 Flash", "benchAqua", "triangle*", "draw=white, fill=benchAqua"),
}
COLORS = {"benchBlue": "2A78D6", "benchOrange": "EB6834", "benchAqua": "1BAF7A", "benchGray": "898781"}


def composite(df: pd.DataFrame) -> pd.Series:
    return sum(df[d] * w for d, w in WEIGHTS.items())


def boot_mean_ci(x: np.ndarray, rng: np.random.Generator) -> tuple[float, float]:
    idx = rng.integers(0, len(x), size=(B, len(x)))
    m = x[idx].mean(1)
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def num(x: float, nd: int = 2, sign: bool = False) -> str:
    s = f"{x:+.{nd}f}" if sign else f"{x:.{nd}f}"
    return s.replace("-", "$-$", 1) if s.startswith("-") else s


def main():
    rng = np.random.default_rng(SEED)
    df = pd.read_csv(DATA / "benchmark-scores.csv")
    df["composite"] = composite(df)
    df["key"] = np.where((df.arm == "gpt") & (df.judge == "stored_old"), "gpt_old", df.arm)
    posts = sorted(df.post.unique())
    assert len(posts) == 10 and df.groupby("key").size().eq(10).all(), "esperava 10 posts por série"

    hashes = df[df.judge == "current"].rubricHash.unique()
    assert len(hashes) == 1, f"juiz atual não é único: {hashes}"

    wide = {k: g.set_index("post").loc[posts] for k, g in df.groupby("key")}
    res: dict = {"posts": posts, "current_hash": hashes[0],
                 "old_hash": df[df.key == "gpt_old"].rubricHash.iloc[0], "series": {}}

    for k, g in wide.items():
        s = {"accept": int((g.decision == "ACCEPT").sum()),
             "composite_sd": float(g.composite.std(ddof=1)),
             "distinct_vectors": int(len({tuple(r) for r in g[FOUR].to_numpy()})),
             "mean_chars": float(g.charCount.mean())}
        for d in DIMS + ["composite"]:
            x = g[d].to_numpy(float)
            lo, hi = boot_mean_ci(x, rng)
            s[d] = {"mean": float(x.mean()), "lo": lo, "hi": hi}
        res["series"][k] = s

    # Comparações pareadas por tópico, sob o mesmo juiz (o atual).
    pares = [("claude", "gpt"), ("gemini", "gpt"), ("gemini", "claude")]
    res["paired"] = {}
    for a, b in pares:
        d = wide[a].composite.to_numpy() - wide[b].composite.to_numpy()
        lo, hi = boot_mean_ci(d, rng)
        res["paired"][f"{a}-{b}"] = {"mean": float(d.mean()), "lo": lo, "hi": hi,
                                     "wins": int((d > 0).sum()), "ties": int((d == 0).sum())}

    # Mesmo texto, dois prompts do Critic.
    old, new = wide["gpt_old"], wide["gpt"]
    res["judge_shift"] = {d: float((new[d] - old[d]).mean()) for d in DIMS + ["composite"]}
    res["judge_shift_decisions_changed"] = int((new.decision != old.decision).sum())

    # Relevância dos braços novos: o Critic dá sempre o mesmo ponto?
    novos = pd.concat([wide["claude"], wide["gemini"]])
    res["new_arms_relevance_values"] = sorted(map(int, novos.relevance.unique()))
    res["new_arms_relevance_mode_share"] = float((novos.relevance == novos.relevance.mode()[0]).mean())

    # Correlação com os humanos (só o GPT tem nota humana): o Critic atual
    # ordena os posts como os humanos? n = 10 e humanos com alfa ~ 0: descritivo.
    _form, _critic, form_posts, H, *_ = load_form()
    hm = pd.DataFrame(H.mean(0), index=form_posts, columns=DIMS).loc[posts]
    hm["composite"] = composite(hm)
    res["human_spearman"] = {}
    for k in ["gpt_old", "gpt"]:
        g = wide[k]
        out = {}
        for d in ["composite", "overall"]:
            out[d] = float(spearmanr(g[d], hm[d]).correlation) if g[d].nunique() > 1 else float("nan")
        res["human_spearman"][k] = out

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    write_macros(res)
    write_table(res)
    write_figure(res, wide, posts)
    print(f"benchmark: tabelas e figura em {TABLES} · resultados em {OUT / 'results.json'}")


def write_macros(r):
    s = r["series"]
    L = ["% GERADO por study/analysis/benchmark.py — não editar à mão."]
    m = lambda name, val: L.append(f"\\newcommand{{\\{name}}}{{{val}}}")
    tag = {"gpt": "Gpt", "claude": "Cla", "gemini": "Gem", "gpt_old": "GptOld"}
    dtag = {"clarity": "Clar", "relevance": "Rel", "professional": "Pro", "engagement": "Eng",
            "overall": "Ove", "composite": "Comp"}
    for k, t in tag.items():
        m(f"Bm{t}Accept", s[k]["accept"])
        m(f"Bm{t}Vectors", s[k]["distinct_vectors"])
        m(f"Bm{t}CompSD", num(s[k]["composite_sd"]))
        for d, dt in dtag.items():
            m(f"Bm{t}{dt}", num(s[k][d]["mean"]))
        m(f"Bm{t}CompLo", num(s[k]["composite"]["lo"]))
        m(f"Bm{t}CompHi", num(s[k]["composite"]["hi"]))
    ptag = {"claude-gpt": "ClaGpt", "gemini-gpt": "GemGpt", "gemini-claude": "GemCla"}
    for k, t in ptag.items():
        p = r["paired"][k]
        m(f"BmDiff{t}", num(p["mean"], sign=True))
        m(f"BmDiff{t}Lo", num(p["lo"], sign=True))
        m(f"BmDiff{t}Hi", num(p["hi"], sign=True))
        m(f"BmWins{t}", p["wins"])
        m(f"BmTies{t}", p["ties"])
    for d, dt in dtag.items():
        m(f"BmShift{dt}", num(r["judge_shift"][d], sign=True))
    m("BmShiftDecisions", r["judge_shift_decisions_changed"])
    m("BmRelModeShare", f"{r['new_arms_relevance_mode_share'] * 100:.0f}\\%")
    for k, t in {"gpt_old": "Old", "gpt": "New"}.items():
        for d, dt in {"composite": "Comp", "overall": "Ove"}.items():
            v = r["human_spearman"][k][d]
            m(f"BmRho{t}{dt}", "n/a" if np.isnan(v) else num(v))
    m("BmOldHash", r["old_hash"][:8])
    m("BmNewHash", r["current_hash"][:8])
    (TABLES / "benchmark_macros.tex").write_text("\n".join(L) + "\n", encoding="utf-8")


def write_table(r):
    s = r["series"]
    rows = []
    for k in ["gpt_old", "gpt", "claude", "gemini"]:
        label = SERIES[k][0]
        c = s[k]["composite"]
        cells = " & ".join(num(s[k][d]["mean"], 1) for d in DIMS)
        rows.append(f"{label} & {s[k]['accept']}/10 & {num(c['mean'])} [{num(c['lo'])}, {num(c['hi'])}] & {cells} \\\\")
        if k == "gpt_old":
            rows.append("\\midrule")
    body = "\n".join(rows)
    tex = (
        "% GERADO por study/analysis/benchmark.py — não editar à mão.\n"
        "\\begin{tabular}{lcccccccc}\n\\toprule\n"
        "Writer & Acc. & Composite [95\\% CI] & Cla & Rel & Pro & Eng & Ove \\\\\n\\midrule\n"
        f"{body}\n\\bottomrule\n\\end{{tabular}}\n"
    )
    (TABLES / "benchmark.tex").write_text(tex, encoding="utf-8")


def write_figure(r, wide, posts):
    s = r["series"]
    L = ["% GERADO por study/analysis/benchmark.py — não editar à mão.",
         "% Requer \\usepackage{pgfplots} e \\usepgfplotslibrary{groupplots}."]
    for n, h in COLORS.items():
        L.append(f"\\definecolor{{{n}}}{{HTML}}{{{h}}}")
    L += [
        "\\begin{tikzpicture}",
        "\\begin{groupplot}[group style={group size=2 by 1, horizontal sep=1.6cm},",
        "  height=5.2cm, axis line style={draw=black!45}, tick style={draw=black!45},",
        "  tick label style={font=\\footnotesize}, label style={font=\\footnotesize},",
        "  title style={font=\\footnotesize\\bfseries, yshift=-4pt},",
        "  ymajorgrids, grid style={draw=black!10}, axis x line*=bottom, axis y line*=left]",
    ]
    # (a) médias por dimensão, só o juiz atual (a comparação válida).
    dims_lbl = "Cla,Rel,Pro,Eng,Ove"
    L += [
        "\\nextgroupplot[width=0.47\\textwidth, title={(a) Mean score per dimension (current Critic)},",
        "  ybar=1.2pt, bar width=5pt, ymin=1, ymax=5, ytick={1,2,3,4,5}, ylabel={Critic score},",
        f"  symbolic x coords={{{dims_lbl}}}, xtick=data, enlarge x limits=0.14,",
        "  legend style={font=\\scriptsize, draw=none, fill=none, at={(0.5,-0.2)}, anchor=north, legend columns=3},",
        "  legend image code/.code={\\draw[#1, draw=none] (0cm,-0.08cm) rectangle (0.24cm,0.1cm);}]",
    ]
    abbr = dict(zip(DIMS, dims_lbl.split(",")))
    for k in ["gpt", "claude", "gemini"]:
        label, color, _, _ = SERIES[k]
        coords = " ".join(
            f"({abbr[d]},{s[k][d]['mean']:.3f}) += (0,{s[k][d]['hi'] - s[k][d]['mean']:.3f}) -= (0,{s[k][d]['mean'] - s[k][d]['lo']:.3f})"
            for d in DIMS)
        L.append(f"\\addplot[fill={color}, draw=none, error bars/.cd, y dir=both, y explicit, "
                 f"error bar style={{draw=black!55, line width=0.4pt}}] coordinates {{{coords}}};")
        L.append(f"\\addlegendentry{{{label}}}")
    # (b) composta por post: mostra o efeito do juiz (cinza→azul) e dos escritores.
    L += [
        "\\nextgroupplot[width=0.47\\textwidth, title={(b) Composite score per post},",
        f"  ymin=1.5, ymax=5, ytick={{2,3,{THRESHOLD},4,5}}, yticklabels={{2,3,3.5,4,5}}, ylabel={{Composite}},",
        f"  symbolic x coords={{{','.join(posts)}}}, xtick=data, xlabel={{Post (same topic across writers)}}, enlarge x limits=0.06,",
        "  legend style={font=\\scriptsize, draw=none, fill=none, at={(0.5,-0.3)}, anchor=north, legend columns=2}]",
        f"\\addplot[draw=black!60, line width=0.6pt, forget plot] coordinates {{({posts[0]},{THRESHOLD}) ({posts[-1]},{THRESHOLD})}};",
        f"\\node[font=\\scriptsize, text=black!60, anchor=south east] at (axis cs:{posts[-1]},{THRESHOLD}) {{acceptance threshold}};",
    ]
    for k in ["gpt_old", "gpt", "claude", "gemini"]:
        label, color, mark, style = SERIES[k]
        g = wide[k]
        coords = " ".join(f"({p},{g.loc[p, 'composite']:.2f})" for p in posts)
        L.append(f"\\addplot[only marks, mark={mark}, mark size=2.3pt, mark options={{{style}, line width=0.6pt}}] coordinates {{{coords}}};")
        L.append(f"\\addlegendentry{{{label}}}")
    L += ["\\end{groupplot}", "\\end{tikzpicture}"]
    (TABLES / "benchmark_fig.tex").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
