"""
Analise do estudo do GATE: o Critic e um controle de qualidade confiavel quando
o julgamento humano e a referencia externa?

Implementa os passos 6-10 de `Evaluation-Process.md` sobre a rubrica v2
(`src/app/MAS/lib/rubric.ts`): quatro dimensoes 1-5 com ancoras, mais a nota
holistica, e a regra vigente ACCEPT <=> composto ponderado >= 3,5 com piso.

  6. concordancia ENTRE humanos      -> alfa de Krippendorff (ordinal), ICC(2,1)/(2,k)
  7. referencia humana                -> mediana dos avaliadores, por post e dimensao
  8. alinhamento juiz x humano        -> Spearman, vies, MAE, % exato / +-1, Wilcoxon
  9. o juiz como GATE                 -> matriz de confusao, falso-aceite, kappa
 10. inspecao qualitativa             -> falsos-aceites e |diff| >= 2, com o texto

SUBSTITUI `quality_study.py`, que analisa o desenho v1 (criterios 0-10, braco
com-judge x sem-judge). Aquele desenho nao existe mais - ver `../ACHADOS.md`.

TRES DECISOES QUE ESTE SCRIPT NAO TOMA SOZINHO
----------------------------------------------
1. A REGRA DE ACEITACAO E PRE-REGISTRADA. `--accept-min` existe para a analise
   de sensibilidade (ACCEPT_MIN_STRICT = 4 no rubric.ts), e o relatorio traz as
   duas leituras SEMPRE, lado a lado. Escolher uma depois de ver o resultado
   humano e p-hacking com outro nome.
2. A DECISAO E CALCULADA DOS DOIS LADOS PELA MESMA REGRA - a do juiz a partir
   das notas dele, a humana a partir da mediana. A coluna `decision` do export
   e conferida contra a regra e uma divergencia vira aviso, nunca correcao
   silenciosa.
3. NOTA FALTANDO INUTILIZA O ITEM. Nao ha imputacao: um avaliador que pulou uma
   pergunta sai daquele post naquela dimensao, e o `n` de cada linha do
   relatorio diz quantas unidades sobraram.

ENTRADAS (em study/data/ por padrao)
------------------------------------
  corpus.csv          GET /api/mas/export/corpus?format=csv
                      1 linha por candidato; so `inCorpus=true` entra na analise.
                      Traz post (letra), versionId, topic, as 4 notas do juiz,
                      overall, decision e o texto (`conteudo`).
  form-responses.csv  export do Google Forms, 1 linha por avaliador.
                      Colunas no padrao `[A1] pergunta...` - ver ../FORM-AVALIACAO.md.
  mapping-corpus.csv  (opcional) GET ...?format=mapping. Redundante de proposito:
                      sai do mesmo endpoint e serve so para acusar edicao a mao.
  judge-repeat.csv    (opcional) GET /api/mas/export/judge-repeat?n=5&format=csv.
                      Teto da concordancia: o juiz nao pode concordar com alguem
                      mais do que concorda consigo mesmo.

SAIDAS (em study/analysis/out/)
-------------------------------
  Um CSV por analise, `summary.txt` com tudo em texto, tres figuras e
  `human_ratings_long.csv` - o formato normalizado que `pnpm study:import-humans`
  carrega na tabela `human_ratings`. Este script e o UNICO parser do CSV do
  Forms; o importador le a saida dele, para nao existirem dois parsers do mesmo
  arquivo divergindo no primeiro ajuste.

USO
---
  python gate_study.py                    # dados reais em study/data/
  python gate_study.py --demo             # sintetico realista (corpus todo-ACCEPT)
  python gate_study.py --demo-balanced    # sintetico com REJECT do juiz (exercita kappa)
  python gate_study.py --data-dir X --out-dir Y
  python gate_study.py --accept-min 4     # so a sensibilidade; o gate continua 3

Dependencias: pandas, numpy, scipy, matplotlib (requirements.txt).
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Iterable

import numpy as np
import pandas as pd

# ─── O instrumento, espelhado de src/app/MAS/lib/rubric.ts ───────────────────
#
# Espelho, nao fonte. O TypeScript manda; se as duas listas divergirem, o
# alinhamento passa a comparar dimensoes trocadas sem nenhum erro aparecer - por
# isso o digito do codigo `[A1]` e conferido contra esta ordem na leitura do
# formulario, e nao apenas usado como indice.

DIMENSIONS = [
    ("clarity", "Clareza e legibilidade"),
    ("relevance", "Relevancia e valor informativo"),
    ("professional", "Adequacao profissional"),
    ("engagement", "Qualidade do engajamento"),
]
DIM_KEYS = [k for k, _ in DIMENSIONS]
DIM_LABEL = dict(DIMENSIONS)
DIM_LABEL["overall"] = "Qualidade geral (holistica)"

# Digito do codigo [<letra><digito>] -> chave. A ordem e a de RUBRIC_DIMENSIONS,
# com o `overall` por ultimo porque e assim que juiz e humano respondem.
DIM_BY_DIGIT = {1: "clarity", 2: "relevance", 3: "professional", 4: "engagement", 5: "overall"}

ACCEPT_MIN = 3          # rubric.ts: ACCEPT_MIN — hoje o PISO, nao mais o gate
ACCEPT_MIN_STRICT = 4   # rubric.ts: ACCEPT_MIN_STRICT — so analise de sensibilidade
# rubric.ts: WEIGHT_BP / ACCEPT_COMPOSITE_MIN. Pesos em centesimos pelo mesmo
# motivo do TypeScript: a soma ponderada em float erra no limiar (0,35*2 +
# 0,35*4 + 0,15*2 + 0,15*4 = 2,9999999999999996) e a decisao mudaria por residuo.
WEIGHT_BP = {"clarity": 35, "relevance": 35, "professional": 15, "engagement": 15}
ACCEPT_COMPOSITE_MIN = 3.5
EPSILON = 1e-9
SCALE = (1, 5)

# `[A1]`, `[ A 1 ]`, `[A1] pergunta...` — a folga de espaco existe porque o
# titulo e digitado a mao no Forms. A faixa e A-Z: CORPUS_MAX_POSTS = 24, e
# postLabel() so sai do alfabeto acima de 26 itens.
COL_CODE = re.compile(r"^\s*\[\s*([A-Z])\s*([1-5])\s*\]")
# "4 — Bom: Claro e bem organizado..." -> 4. A escala linear ja vem "4".
LEADING_DIGIT = re.compile(r"^\s*([1-5])\b")

TIMESTAMP_COLS = ("Carimbo de data/hora", "Timestamp")
EMAIL_COLS = ("Endereço de e-mail", "Endereco de e-mail", "Email Address", "Email address")


# ─── Estatística ─────────────────────────────────────────────────────────────


def krippendorff_alpha_ordinal(units: Iterable[list[float]]) -> tuple[float, int, int]:
    """
    α de Krippendorff com métrica ORDINAL, sobre a matriz de coincidências.

    Implementado aqui em vez de importado porque a única dependência decente do
    PyPI (`krippendorff`) só faz o cálculo por métrica de intervalo por padrão, e
    trocar a métrica silenciosamente muda o número que vai para o artigo.

    Ordinal e não nominal: discordar 4×5 não é o mesmo erro que discordar 1×5, e
    a rubrica é uma escala ordenada com âncoras. Ordinal e não intervalar:
    ninguém garante que a distância 1→2 é a mesma que 4→5.

        α = 1 − D_o/D_e = 1 − (n−1)·Σ o_ck·δ²_ck / Σ n_c·n_k·δ²_ck
        δ²_ck = ( Σ_{g=c..k} n_g − (n_c + n_k)/2 )²

    `units` é uma lista por unidade (post) com as notas que ela recebeu; unidade
    com menos de duas notas não é pareável e sai do cálculo, como manda a
    definição — não é o mesmo que jogá-la fora do estudo.

    Devolve (α, unidades pareáveis, notas usadas).
    """
    pares = [list(u) for u in units if len(u) >= 2]
    valores = sorted({v for u in pares for v in u})
    if len(pares) < 2 or len(valores) < 2:
        # Um único valor em todo o corpus: não há desacordo nem acordo possível.
        return float("nan"), len(pares), sum(len(u) for u in pares)

    idx = {v: i for i, v in enumerate(valores)}
    V = len(valores)

    o = np.zeros((V, V))
    for u in pares:
        m = len(u)
        peso = 1.0 / (m - 1)
        for a in range(m):
            for b in range(m):
                if a != b:
                    o[idx[u[a]], idx[u[b]]] += peso

    n_c = o.sum(axis=1)
    n = n_c.sum()
    if n < 2:
        return float("nan"), len(pares), int(n)

    delta = np.zeros((V, V))
    for c in range(V):
        for k in range(V):
            lo, hi = (c, k) if c <= k else (k, c)
            s = n_c[lo : hi + 1].sum() - (n_c[c] + n_c[k]) / 2.0
            delta[c, k] = s * s

    num = float((o * delta).sum())
    den = float((np.outer(n_c, n_c) * delta).sum())
    if den == 0:
        return float("nan"), len(pares), int(n)
    return 1.0 - (n - 1) * num / den, len(pares), int(n)


def icc_2way(x: np.ndarray) -> tuple[float, float, int, int]:
    """
    ICC(2,1) e ICC(2,k) — dois fatores aleatórios, concordância ABSOLUTA.

    Absoluta e não consistência: um avaliador que dá sempre um ponto a mais que
    os outros ordena igual (Spearman perfeito) e não concorda com eles. É
    exatamente o modo de falha que o estudo procura no juiz, então a versão que
    perdoa deslocamento não serve.

    `x`: matriz unidades × avaliadores, só linhas completas.
    Devolve (ICC(2,1), ICC(2,k), n unidades, k avaliadores).
    """
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x).any(axis=1)]
    n, k = x.shape
    if n < 2 or k < 2:
        return float("nan"), float("nan"), n, k

    grand = x.mean()
    msr = k * ((x.mean(axis=1) - grand) ** 2).sum() / (n - 1)
    msc = n * ((x.mean(axis=0) - grand) ** 2).sum() / (k - 1)
    resid = x - x.mean(axis=1, keepdims=True) - x.mean(axis=0, keepdims=True) + grand
    mse = (resid**2).sum() / ((n - 1) * (k - 1))

    d1 = msr + (k - 1) * mse + k * (msc - mse) / n
    dk = msr + (msc - mse) / n
    icc1 = (msr - mse) / d1 if d1 != 0 else float("nan")
    icck = (msr - mse) / dk if dk != 0 else float("nan")
    return icc1, icck, n, k


def cohen_kappa_2x2(tp: int, fp: int, fn: int, tn: int) -> tuple[float, str]:
    """
    κ de Cohen numa matriz 2×2, com o motivo quando o número não existe.

    Devolver `nan` mudo aqui seria o pior desfecho possível: o corpus todo-ACCEPT
    (ver ../ACHADOS.md §6) produz exatamente esse caso, e um `nan` sem
    explicação no relatório já foi lido como bug de script uma vez.
    """
    n = tp + fp + fn + tn
    if n == 0:
        return float("nan"), "sem casos"
    po = (tp + tn) / n
    linha_a, linha_r = tp + fp, fn + tn      # decisão do juiz
    col_a, col_r = tp + fn, fp + tn          # decisão humana
    pe = (linha_a * col_a + linha_r * col_r) / (n * n)
    degenerado = []
    if linha_a == 0 or linha_r == 0:
        degenerado.append("o juiz decidiu igual em todos os posts")
    if col_a == 0 or col_r == 0:
        degenerado.append("os humanos decidiram igual em todos os posts")
    if abs(1 - pe) < 1e-12:
        return float("nan"), "indefinido: " + "; ".join(degenerado or ["margem degenerada"])
    if degenerado:
        # kappa existe, mas com uma margem constante ele mede quase so a
        # prevalencia. Reportar o numero pelado aqui ja induziu leitura errada.
        return (po - pe) / (1 - pe), "pouco informativo: " + "; ".join(degenerado)
    return (po - pe) / (1 - pe), ""


def spearman(a: np.ndarray, b: np.ndarray) -> tuple[float, float, str]:
    """Spearman com o motivo quando não há o que correlacionar."""
    from scipy import stats

    a, b = np.asarray(a, float), np.asarray(b, float)
    ok = ~(np.isnan(a) | np.isnan(b))
    a, b = a[ok], b[ok]
    if len(a) < 3:
        return float("nan"), float("nan"), "n < 3"
    if np.ptp(a) == 0 and np.ptp(b) == 0:
        return float("nan"), float("nan"), "sem variância nos dois lados"
    if np.ptp(a) == 0:
        return float("nan"), float("nan"), "sem variância no juiz"
    if np.ptp(b) == 0:
        return float("nan"), float("nan"), "sem variância no humano"
    rho, p = stats.spearmanr(a, b)
    return float(rho), float(p), ""


def wilcoxon_bias(diff: np.ndarray) -> tuple[float, str]:
    """Wilcoxon pareado sobre o viés (juiz − humano). H0: mediana do viés = 0."""
    from scipy import stats

    d = np.asarray(diff, float)
    d = d[~np.isnan(d)]
    nz = d[d != 0]
    if len(nz) < 5:
        return float("nan"), f"n útil = {len(nz)} (< 5): o teste não desce de p relevante"
    try:
        return float(stats.wilcoxon(d, zero_method="wilcox").pvalue), ""
    except ValueError as e:
        return float("nan"), str(e)


def median_ordinal(values: Iterable[float]) -> float:
    """Mediana — espelha `median()` do rubric.ts (par → média dos dois centrais)."""
    xs = sorted(v for v in values if v is not None and not (isinstance(v, float) and np.isnan(v)))
    if not xs:
        return float("nan")
    m = len(xs) // 2
    return float(xs[m]) if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2.0


def composite(scores: dict[str, float]) -> float:
    """Media ponderada das quatro. Espelha `composite()` do rubric.ts."""
    bp = sum(scores[k] * WEIGHT_BP[k] for k in DIM_KEYS)
    return bp / 100.0


def decide(
    scores: dict[str, float],
    minimo: float = ACCEPT_MIN,
    composite_min: float = ACCEPT_COMPOSITE_MIN,
) -> str:
    """ACCEPT <=> composto >= 3,5 E o piso nao violado. Espelha `decide()` do rubric.ts.

    MUDOU EM 2026-09-08. Era `toda dimensao >= 3`, pre-registrada, e aceitava
    22 de 22 execucoes sem o loop do judge disparar uma vez. O piso continua
    existindo como segunda condicao: reprova quando duas dimensoes caem abaixo
    de `minimo` e uma delas e clareza ou relevancia — a media perdoa buraco
    isolado por compensacao, e buraco em conteudo acompanhado de outro nao e
    compensavel.

    `minimo` continua parametrizavel para a analise de sensibilidade.
    """
    vals = [scores.get(k, float("nan")) for k in DIM_KEYS]
    if any(np.isnan(v) for v in vals):
        return ""
    abaixo = [k for k in DIM_KEYS if scores[k] < minimo]
    if len(abaixo) >= 2 and ({"clarity", "relevance"} & set(abaixo)):
        return "REJECT"
    return "ACCEPT" if composite(scores) >= composite_min - EPSILON else "REJECT"


# ─── Leitura ─────────────────────────────────────────────────────────────────


class Aviso(list):
    """Avisos acumulados. Vão para o stdout E para o summary.txt — um aviso que
    só aparece no terminal some no dia em que alguém redireciona a saída."""

    def add(self, msg: str) -> None:
        self.append(msg)
        print(f"  ! {msg}", file=sys.stderr)


def _read_csv(path: str) -> pd.DataFrame:
    # utf-8-sig: o CSV do Google Forms vem com BOM, o do ExcelJS não.
    return pd.read_csv(path, encoding="utf-8-sig", dtype=str, keep_default_na=False)


def load_corpus(path: str, avisos: Aviso) -> pd.DataFrame:
    """corpus.csv → 1 linha por post do corpus, com as notas do juiz."""
    df = _read_csv(path)
    faltando = {"post", "versionId", "topic", "decision", "conteudo"} - set(df.columns)
    if faltando:
        sys.exit(f"corpus.csv sem as colunas {sorted(faltando)} — reexporte ?format=csv")

    if "inCorpus" in df.columns:
        fora = (~df["inCorpus"].str.lower().isin(["true", "1"])).sum()
        df = df[df["inCorpus"].str.lower().isin(["true", "1"])].copy()
        if fora:
            print(f"  corpus.csv: {fora} candidato(s) fora do corpus (coluna `exclusion`)")

    for c in DIM_KEYS + ["overall"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["post"] = df["post"].str.strip()
    df = df[df["post"] != ""].set_index("post", drop=False)

    # A decisão do export é conferida contra a regra, nunca substituída em
    # silêncio: divergência aqui é sinal de rubrica mudada entre a pontuação e o
    # export, e isso invalida a coleta — precisa aparecer, não ser corrigido.
    for post, r in df.iterrows():
        esperado = decide({k: r[k] for k in DIM_KEYS})
        if esperado and r["decision"] and esperado != r["decision"]:
            avisos.add(
                f"post {post}: `decision`={r['decision']} no export, mas a regra "
                f"(composto ≥ {ACCEPT_COMPOSITE_MIN} + piso {ACCEPT_MIN}) dá "
                f"{esperado}. Análise usa a REGRA."
            )
    df["judge_decision"] = [decide({k: r[k] for k in DIM_KEYS}) for _, r in df.iterrows()]
    return df


def load_form(path: str, corpus: pd.DataFrame, avisos: Aviso) -> pd.DataFrame:
    """
    form-responses.csv (Forms, 1 linha por avaliador) → longo
    (rater, post, dim, value).

    O avaliador é identificado pelo e-mail e imediatamente pseudonimizado para
    R1, R2… na ordem de chegada: o e-mail não pode viajar para `out/` nem para o
    banco, e um código digitado à mão erra. Sem e-mail (coleta anônima), cai
    para o número da linha — funciona, mas perde a deduplicação.
    """
    df = _read_csv(path)

    col_email = next((c for c in EMAIL_COLS if c in df.columns), None)
    col_ts = next((c for c in TIMESTAMP_COLS if c in df.columns), None)
    if col_email is None:
        avisos.add(
            "form-responses.csv sem coluna de e-mail: os avaliadores viram R1..Rn pela "
            "ordem das linhas. Duas respostas da mesma pessoa contam como duas."
        )

    # Marca de simulação. `simular_humanos.py` escreve a coluna AVISO; o Forms
    # nunca escreveria uma. Sem esta detecção, um CSV simulado sobre o corpus
    # REAL tem versionId válido e passaria por todas as guardas do importador —
    # dado fictício na tabela do estudo é o pior desfecho possível deste
    # pipeline, e é o único que ninguém percebe depois.
    simulado = any(
        "FICTÍCIO" in str(v).upper() or "FICTICIO" in str(v).upper()
        for c in df.columns if c.strip().upper() == "AVISO"
        for v in df[c]
    )
    if simulado:
        avisos.add("ORIGEM SIMULADA: este form-responses.csv foi gerado por "
                   "simular_humanos.py. Nada daqui é dado, e o importador vai recusar.")

    codificadas = [(c, m) for c in df.columns if (m := COL_CODE.match(c))]
    if not codificadas:
        sys.exit(
            "nenhuma coluna no padrão `[A1] ...` em form-responses.csv.\n"
            "O título de cada pergunta precisa do prefixo — ver ../FORM-AVALIACAO.md §4."
        )

    # Duas colunas com o mesmo código = pergunta duplicada no formulário. Não dá
    # para adivinhar qual vale; parar é mais barato que analisar metade do dado.
    vistos: dict[str, str] = {}
    for c, m in codificadas:
        chave = m.group(1) + m.group(2)
        if chave in vistos:
            sys.exit(f"código [{chave}] em duas colunas do Forms:\n  {vistos[chave]}\n  {c}")
        vistos[chave] = c

    linhas = []
    for i, row in df.iterrows():
        rater_raw = (row[col_email].strip() if col_email else "") or f"linha-{i + 2}"
        ts = row[col_ts].strip() if col_ts else ""
        for c, m in codificadas:
            post, digito = m.group(1), int(m.group(2))
            bruto = str(row[c]).strip()
            if not bruto:
                continue
            g = LEADING_DIGIT.match(bruto)
            if not g:
                avisos.add(f"[{post}{digito}] resposta ilegível de um avaliador: {bruto[:40]!r}")
                continue
            linhas.append(
                {
                    "rater_raw": rater_raw,
                    "submitted_at": ts,
                    "post": post,
                    "dim": DIM_BY_DIGIT[digito],
                    "value": int(g.group(1)),
                }
            )

    if not linhas:
        sys.exit("form-responses.csv sem nenhuma resposta legível.")
    longo = pd.DataFrame(linhas)

    longo.attrs["simulado"] = simulado
    ordem = list(dict.fromkeys(longo["rater_raw"]))
    pseudo = {r: f"R{i + 1}" for i, r in enumerate(ordem)}
    longo["rater"] = longo["rater_raw"].map(pseudo)

    # Letras que o formulário tem e o corpus não (ou o contrário) são erro de
    # montagem, e é barato pegá-lo antes de a análise rodar sobre o post errado.
    no_form = set(longo["post"])
    no_corpus = set(corpus["post"])
    if extra := sorted(no_form - no_corpus):
        avisos.add(f"posts no formulário que não estão no corpus: {extra} — ignorados")
        longo = longo[longo["post"].isin(no_corpus)]
        longo.attrs["simulado"] = simulado
    if falta := sorted(no_corpus - no_form):
        avisos.add(f"posts do corpus sem nenhuma resposta humana: {falta}")

    esperadas = len(no_corpus & no_form) * 5
    for r, g in longo.groupby("rater"):
        if len(g) < esperadas:
            avisos.add(f"{r}: {len(g)} de {esperadas} respostas — itens incompletos saem do α")
    return longo


def load_mapping(path: str, corpus: pd.DataFrame, avisos: Aviso) -> None:
    """Confere o mapping contra o corpus. Não devolve nada: é só o alarme de
    edição à mão — o mapping sai do MESMO endpoint, então divergir é impossível
    a menos que alguém tenha mexido num dos dois arquivos."""
    m = _read_csv(path).set_index("post")
    for post, r in m.iterrows():
        if post not in corpus.index:
            avisos.add(f"mapping tem o post {post}, que não está no corpus.csv")
        elif r["versionId"] != corpus.loc[post, "versionId"]:
            avisos.add(
                f"post {post}: versionId diferente entre mapping e corpus — "
                "um dos dois foi editado; a junção com as respostas está em risco"
            )


def load_judge_repeat(path: str) -> pd.DataFrame | None:
    """judge-repeat.csv → notas repetidas do mesmo draft (teto da concordância)."""
    df = _read_csv(path)
    chave = "versionId" if "versionId" in df.columns else ("post" if "post" in df.columns else None)
    if chave is None:
        return None
    for c in DIM_KEYS + ["overall"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["_chave"] = df[chave]
    return df


# ─── Passo 6 · concordância ENTRE humanos ────────────────────────────────────


def matriz_posts_x_raters(longo: pd.DataFrame, dim: str) -> pd.DataFrame:
    return longo[longo["dim"] == dim].pivot_table(
        index="post", columns="rater", values="value", aggfunc="first"
    )


def passo6_humanos(longo: pd.DataFrame) -> pd.DataFrame:
    """
    α de Krippendorff por dimensão, mais ICC e concordância par a par.

    Vem ANTES de tudo de propósito (§6 do doc): se os humanos não concordam
    entre si numa dimensão, a mediana deles é uma referência ruidosa e um
    alinhamento juiz–humano baixo naquela dimensão não é evidência contra o
    juiz. Este bloco é o piso de leitura do bloco 8.
    """
    linhas = []
    for dim in DIM_KEYS + ["overall"]:
        m = matriz_posts_x_raters(longo, dim)
        unidades = [[v for v in row if not np.isnan(v)] for row in m.to_numpy(float)]
        alpha, n_units, _ = krippendorff_alpha_ordinal(unidades)
        icc1, icck, n_icc, _ = icc_2way(m.to_numpy(float))

        # Concordância bruta par a par: sobrevive quando o α não existe (uma
        # dimensão com valor único no corpus), e é o número que o orientador lê
        # sem precisar do α.
        iguais = perto = total = 0
        for u in unidades:
            for a in range(len(u)):
                for b in range(a + 1, len(u)):
                    total += 1
                    iguais += u[a] == u[b]
                    perto += abs(u[a] - u[b]) <= 1
        # Variância ENTRE posts da média humana. É o denominador implícito do α
        # e do ICC: perto de zero, os dois desabam mesmo com avaliadores em
        # acordo perfeito, porque não há o que ordenar. Sai como coluna para a
        # leitura não depender de quem lembra dessa propriedade.
        media_por_post = np.nanmean(m.to_numpy(float), axis=1)
        var_entre = float(np.nanvar(media_por_post, ddof=1)) if len(media_por_post) > 1 else float("nan")

        pct_iguais = 100 * iguais / total if total else float("nan")
        pct_ate_1 = 100 * perto / total if total else float("nan")
        linhas.append(
            {
                "dimensao": dim,
                "rotulo": DIM_LABEL[dim],
                "n_posts": n_units,
                "n_avaliadores": int(m.shape[1]),
                "krippendorff_alpha": alpha,
                "icc_2_1": icc1,
                "icc_2_k": icck,
                "n_posts_completos": n_icc,
                "pct_pares_iguais": pct_iguais,
                "pct_pares_ate_1": pct_ate_1,
                "variancia_entre_posts": var_entre,
                # Diagnóstico, não resultado: α baixo COM acordo bruto alto não é
                # "os avaliadores discordam" — é "os posts são indistinguíveis".
                "alpha_sem_variancia": bool(
                    alpha < 0.4 and pct_ate_1 > 80 and var_entre < 0.35
                ),
            }
        )
    return pd.DataFrame(linhas)


def perfil_avaliadores(longo: pd.DataFrame) -> pd.DataFrame:
    """
    Média de cada avaliador por dimensão e o quanto ela se afasta do grupo.

    Não entra em nenhuma conclusão — serve para achar o avaliador
    sistematicamente generoso ou duro antes de a mediana de três esconder o
    problema. Com n=3, um avaliador deslocado move a referência inteira.
    """
    med = longo.groupby("dim")["value"].mean()
    linhas = []
    for r, g in longo.groupby("rater"):
        linha = {"avaliador": r, "n_respostas": len(g)}
        for dim in DIM_KEYS + ["overall"]:
            gd = g[g["dim"] == dim]["value"]
            linha[dim] = gd.mean() if len(gd) else float("nan")
            linha[f"{dim}_vs_grupo"] = linha[dim] - med.get(dim, float("nan"))
        linhas.append(linha)
    return pd.DataFrame(linhas)


# ─── Passo 7 · a referência humana ───────────────────────────────────────────


def passo7_referencia(longo: pd.DataFrame, corpus: pd.DataFrame, minimo: float) -> pd.DataFrame:
    """
    Mediana das notas humanas por post × dimensão, ao lado da nota do juiz, com
    a MESMA regra de decisão aplicada aos dois — que é o que torna a matriz do
    passo 9 uma comparação legítima.

    Mediana e não média: as notas são ordinais. A média de {3,3,5} é 3,67, um
    ponto que a escala não tem e cuja âncora ninguém escreveu.
    """
    linhas = []
    for post in sorted(set(longo["post"])):
        g = longo[longo["post"] == post]
        c = corpus.loc[post]
        linha = {
            "post": post,
            "versionId": c["versionId"],
            "threadId": c.get("threadId", ""),
            "topic": c["topic"],
            "n_avaliadores": g["rater"].nunique(),
        }
        humano, juiz = {}, {}
        for dim in DIM_KEYS + ["overall"]:
            vals = g[g["dim"] == dim]["value"].tolist()
            humano[dim] = median_ordinal(vals)
            juiz[dim] = float(c[dim]) if pd.notna(c[dim]) else float("nan")
            linha["humano_" + dim] = humano[dim]
            linha["juiz_" + dim] = juiz[dim]
            linha["vies_" + dim] = juiz[dim] - humano[dim]
        linha["humano_decisao"] = decide(humano, minimo)
        linha["juiz_decisao"] = decide(juiz, minimo)
        linha["celula"] = (linha["juiz_decisao"] or "?") + "/" + (linha["humano_decisao"] or "?")
        linhas.append(linha)
    return pd.DataFrame(linhas)


# ─── Passo 8 · alinhamento das NOTAS ─────────────────────────────────────────


def passo8_alinhamento(ref: pd.DataFrame) -> pd.DataFrame:
    """
    Três leituras complementares, porque nenhuma sozinha responde (§8 do doc):

      associação   Spearman — o juiz ORDENA os posts como os humanos?
      viés         juiz − humano — e erra sempre para o mesmo lado? Viés
                   positivo consistente = juiz mais permissivo, que é a hipótese
                   que motivou o estudo.
      acerto       % exato e % dentro de ±1 — a leitura que não depende de
                   variância e por isso sobrevive ao corpus degenerado.
    """
    linhas = []
    for dim in DIM_KEYS + ["overall"]:
        j = ref["juiz_" + dim].to_numpy(float)
        h = ref["humano_" + dim].to_numpy(float)
        d = j - h
        ok = ~np.isnan(d)
        rho, p, motivo = spearman(j, h)
        w_p, w_motivo = wilcoxon_bias(d)
        icc1, _, _, _ = icc_2way(np.column_stack([j, h]))
        linhas.append(
            {
                "dimensao": dim,
                "rotulo": DIM_LABEL[dim],
                "n": int(ok.sum()),
                "juiz_mediana": np.nanmedian(j),
                "humano_mediana": np.nanmedian(h),
                "spearman_rho": rho,
                "spearman_p": p,
                "spearman_motivo": motivo,
                "icc_a1_juiz_humano": icc1,
                "vies_medio": np.nanmean(d),
                "vies_mediano": np.nanmedian(d),
                "mae": np.nanmean(np.abs(d)),
                "pct_exato": 100 * np.mean(d[ok] == 0) if ok.any() else float("nan"),
                "pct_ate_1": 100 * np.mean(np.abs(d[ok]) <= 1) if ok.any() else float("nan"),
                "wilcoxon_p": w_p,
                "wilcoxon_motivo": w_motivo,
            }
        )
    return pd.DataFrame(linhas)


# ─── Passo 9 · o juiz como GATE ──────────────────────────────────────────────


def passo9_gate(longo: pd.DataFrame, corpus: pd.DataFrame, minimo: float) -> dict:
    """
    Matriz de confusão da DECISÃO, com o falso-aceite em destaque.

    Falso-aceite = o juiz diz que o post atende ao limiar e os humanos dizem que
    não. É a operacionalização direta de "o gate é permissivo", e a única célula
    da matriz que descreve dano real: post ruim publicado. Falso-reject custa
    uma reescrita.
    """
    ref = passo7_referencia(longo, corpus, minimo)
    val = ref[(ref["juiz_decisao"] != "") & (ref["humano_decisao"] != "")]
    j_a = val["juiz_decisao"] == "ACCEPT"
    h_a = val["humano_decisao"] == "ACCEPT"
    tp = int((j_a & h_a).sum())
    fp = int((j_a & ~h_a).sum())
    fn = int((~j_a & h_a).sum())
    tn = int((~j_a & ~h_a).sum())
    n = tp + fp + fn + tn
    kappa, kappa_motivo = cohen_kappa_2x2(tp, fp, fn, tn)

    def taxa(num: int, den: int) -> float:
        return num / den if den else float("nan")

    return {
        "limiar": minimo,
        "n": n,
        "true_accept": tp,
        "false_accept": fp,
        "false_reject": fn,
        "true_reject": tn,
        "concordancia": taxa(tp + tn, n),
        # Denominador: o que o juiz APROVOU. "Dos posts que o gate deixou
        # passar, quantos o humano reprovaria?" é a pergunta de quem opera o
        # pipeline — e não é a mesma coisa que fp/n.
        "taxa_falso_aceite": taxa(fp, tp + fp),
        "taxa_falso_reject": taxa(fn, fn + tn),
        # Sensibilidade/especificidade tomam o humano como referência.
        "sensibilidade": taxa(tp, tp + fn),
        "especificidade": taxa(tn, tn + fp),
        "kappa": kappa,
        "kappa_motivo": kappa_motivo,
        "ref": ref,
    }


# ─── Passo 10 · inspeção qualitativa ─────────────────────────────────────────


def passo10_discordancias(ref: pd.DataFrame, corpus: pd.DataFrame) -> pd.DataFrame:
    """
    Os casos que entram no artigo como texto, não como coeficiente (§10 do doc):
    falso-aceite e |juiz − humano| ≥ 2. É aqui que se descobre ONDE o gate falha
    — engajamento superestimado, genérico lido como informativo —, e isso vale
    mais para a discussão do que a terceira casa do ρ.
    """
    linhas = []
    for _, r in ref.iterrows():
        texto = str(corpus.loc[r["post"], "conteudo"])
        falso_aceite = r["juiz_decisao"] == "ACCEPT" and r["humano_decisao"] == "REJECT"
        for dim in DIM_KEYS + ["overall"]:
            d = r["vies_" + dim]
            if np.isnan(d):
                continue
            if abs(d) >= 2 or (falso_aceite and dim != "overall"):
                linhas.append(
                    {
                        "post": r["post"],
                        "motivo": "falso_aceite" if falso_aceite else "diferenca_>=2",
                        "dimensao": dim,
                        "juiz": r["juiz_" + dim],
                        "humano": r["humano_" + dim],
                        "diferenca": d,
                        "topic": r["topic"],
                        "trecho": texto[:180].replace("\n", " / "),
                    }
                )
    cols = ["post", "motivo", "dimensao", "juiz", "humano", "diferenca", "topic", "trecho"]
    return pd.DataFrame(linhas, columns=cols)


# ─── Teto: estabilidade do próprio juiz ──────────────────────────────────────


def analise_retest(rep: pd.DataFrame) -> pd.DataFrame:
    """
    Quanto o juiz varia repontuando o MESMO texto. É o teto da concordância: ele
    não pode concordar com o humano mais do que concorda consigo mesmo, e
    ../ACHADOS.md §2.1 já mediu ~1 ponto de ruído a T=0,1.
    """
    linhas = []
    rodada = rep.groupby("_chave").cumcount()
    for dim in DIM_KEYS + ["overall"]:
        if dim not in rep.columns:
            continue
        m = rep.pivot_table(index="_chave", columns=rodada, values=dim, aggfunc="first")
        arr = m.to_numpy(float)
        if arr.shape[1] < 2:
            continue
        icc1, _, _, _ = icc_2way(arr)
        with np.errstate(invalid="ignore"):
            dp = np.nanstd(arr, axis=1, ddof=1)
            amp = np.nanmax(arr, axis=1) - np.nanmin(arr, axis=1)
        linhas.append(
            {
                "dimensao": dim,
                "n_drafts": int(m.shape[0]),
                "n_rodadas": int(m.shape[1]),
                "icc_teste_reteste": icc1,
                "dp_medio": float(np.nanmean(dp)),
                "amplitude_media": float(np.nanmean(amp)),
                "pct_estavel": 100 * float(np.nanmean(amp == 0)),
            }
        )
    return pd.DataFrame(linhas)


# ─── Saídas ──────────────────────────────────────────────────────────────────


def human_ratings_long(longo: pd.DataFrame, corpus: pd.DataFrame) -> pd.DataFrame:
    """
    Formato normalizado, 1 linha por (avaliador × post), com `versionId` já
    resolvido. É o que `pnpm study:import-humans` carrega na tabela
    `human_ratings` — o importador NÃO reabre o CSV do Forms, para não existir um
    segundo parser do mesmo arquivo divergindo deste no primeiro ajuste.

    A chave de junção é `versionId`, nunca a letra: a letra depende da fila do
    corpus, o id não depende de nada.
    """
    linhas = []
    for (rater, post), g in longo.groupby(["rater", "post"]):
        c = corpus.loc[post]
        linha = {
            "raterId": rater,
            "draftVersionId": c["versionId"],
            "postLabel": post,
            "rubricVersion": "v2",
            # Viaja até o banco: é o que o importador checa antes de gravar.
            "origem": "SIMULADO" if longo.attrs.get("simulado") else "FORMULARIO",
            "submittedAt": g["submitted_at"].iloc[0],
        }
        for dim in DIM_KEYS + ["overall"]:
            v = g[g["dim"] == dim]["value"]
            linha[dim] = int(v.iloc[0]) if len(v) else ""
        linhas.append(linha)
    cols = ["raterId", "draftVersionId", "postLabel", *DIM_KEYS, "overall",
            "rubricVersion", "origem", "submittedAt"]
    return pd.DataFrame(linhas, columns=cols).sort_values(["postLabel", "raterId"])


def figuras(ref: pd.DataFrame, gate: dict, out: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    dims = DIM_KEYS + ["overall"]
    rng = np.random.default_rng(7)  # jitter reprodutível

    # 1. Juiz × humano, um painel por dimensão. Jitter porque a escala é 1–5 e
    #    sem ele quinze posts viram três pontos.
    fig, axes = plt.subplots(1, len(dims), figsize=(3.1 * len(dims), 3.4), sharey=True)
    for ax, dim in zip(np.atleast_1d(axes), dims):
        h = ref["humano_" + dim].to_numpy(float)
        j = ref["juiz_" + dim].to_numpy(float)
        ax.plot([0.5, 5.5], [0.5, 5.5], lw=1, color="#999", ls="--", zorder=1)
        ax.scatter(h + rng.uniform(-0.09, 0.09, len(h)),
                   j + rng.uniform(-0.09, 0.09, len(j)),
                   s=34, alpha=0.75, color="#2563eb", zorder=2)
        ax.set_title(dim, fontsize=10)
        ax.set_xlim(0.5, 5.5)
        ax.set_ylim(0.5, 5.5)
        ax.set_xticks(range(1, 6))
        ax.set_xlabel("mediana humana")
    np.atleast_1d(axes)[0].set_ylabel("nota do juiz")
    fig.suptitle("Juiz × referência humana (linha tracejada = concordância exata)", fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "fig_juiz_vs_humano.png"), dpi=150)
    plt.close(fig)

    # 2. Viés por dimensão. Acima de zero = juiz mais generoso que o humano.
    fig, ax = plt.subplots(figsize=(7, 4))
    dados = [ref["vies_" + d].dropna().to_numpy(float) for d in dims]
    ax.axhline(0, color="#111", lw=1)
    ax.boxplot(dados, tick_labels=dims, showmeans=True)
    for i, d in enumerate(dados, start=1):
        ax.scatter(np.full(len(d), i) + rng.uniform(-0.12, 0.12, len(d)), d,
                   s=22, alpha=0.55, color="#2563eb", zorder=3)
    ax.set_ylabel("viés (juiz − humano)")
    ax.set_title("Viés por dimensão — acima de zero, o juiz é mais permissivo")
    fig.tight_layout()
    fig.savefig(os.path.join(out, "fig_vies_por_dimensao.png"), dpi=150)
    plt.close(fig)

    # 3. Distribuição das notas, juiz e humano lado a lado. É a figura que mostra
    #    a falta de resolução do juiz (../ACHADOS.md §4) sem precisar de teste.
    fig, axes = plt.subplots(1, len(dims), figsize=(3.1 * len(dims), 3.2), sharey=True)
    for ax, dim in zip(np.atleast_1d(axes), dims):
        pontos = np.arange(1, 6)
        cj = [np.sum(ref["juiz_" + dim] == p) for p in pontos]
        ch = [np.sum(np.round(ref["humano_" + dim]) == p) for p in pontos]
        ax.bar(pontos - 0.19, cj, width=0.38, label="juiz", color="#2563eb")
        ax.bar(pontos + 0.19, ch, width=0.38, label="humano", color="#f59e0b")
        ax.set_title(dim, fontsize=10)
        ax.set_xticks(pontos)
    np.atleast_1d(axes)[0].set_ylabel("nº de posts")
    np.atleast_1d(axes)[-1].legend(fontsize=8)
    fig.suptitle("Distribuição das notas (humano = mediana arredondada)", fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "fig_distribuicao.png"), dpi=150)
    plt.close(fig)

    # 4. Matriz de confusão do gate.
    fig, ax = plt.subplots(figsize=(4.6, 4.2))
    m = np.array([[gate["true_accept"], gate["false_accept"]],
                  [gate["false_reject"], gate["true_reject"]]])
    ax.imshow(m, cmap="Blues", vmin=0)
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(m[i, j]), ha="center", va="center", fontsize=20,
                    color="#111" if m[i, j] < m.max() / 2 else "#fff")
    ax.set_xticks([0, 1], ["humano ACCEPT", "humano REJECT"])
    ax.set_yticks([0, 1], ["juiz ACCEPT", "juiz REJECT"])
    ax.set_title("Gate — o canto superior direito é o falso-aceite\n"
                 "(limiar: toda dimensão ≥ %g)" % gate["limiar"], fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "fig_matriz_confusao.png"), dpi=150)
    plt.close(fig)


def _fmt(df: pd.DataFrame) -> str:
    return df.to_string(index=False, float_format=lambda v: f"{v:.3f}", na_rep="—")


def summary(
    avisos: Aviso,
    humanos: pd.DataFrame,
    raters: pd.DataFrame,
    ref: pd.DataFrame,
    alinha: pd.DataFrame,
    gates: list[dict],
    disc: pd.DataFrame,
    retest: pd.DataFrame | None,
) -> str:
    L: list[str] = []
    add = L.append
    add("ESTUDO DO GATE — o Critic é um controle de qualidade confiável?")
    add(
        "Rubrica v2 · regra vigente: ACCEPT ⟺ composto ponderado ≥ %g "
        "(clareza .35 · relevância .35 · profissional .15 · engajamento .15) "
        "e não mais de uma dimensão < %g quando uma delas é clareza ou relevância. "
        "DESVIO DE PRÉ-REGISTRO declarado em 2026-09-08 — a regra anterior era "
        "toda dimensão ≥ %g." % (ACCEPT_COMPOSITE_MIN, ACCEPT_MIN, ACCEPT_MIN)
    )
    add("=" * 78)

    if avisos:
        add("\nAVISOS (leia antes dos números)")
        for a in avisos:
            add("  ! " + a)

    add("\n\n[6] CONCORDÂNCIA ENTRE OS HUMANOS — o piso")
    add("O α ordinal é a referência do doc. Convenção de Krippendorff: α ≥ 0,80")
    add("permite conclusão; 0,67–0,80 é tentativo; abaixo disso a mediana daquela")
    add("dimensão é ruidosa e qualquer desalinhamento juiz–humano nela é ambíguo.")
    add(_fmt(humanos[["dimensao", "n_posts", "n_avaliadores", "krippendorff_alpha",
                      "icc_2_1", "icc_2_k", "pct_pares_iguais", "pct_pares_ate_1",
                      "variancia_entre_posts"]]))
    sem_var = humanos[humanos["alpha_sem_variancia"]]["dimensao"].tolist()
    if sem_var:
        add("")
        add("  ATENÇÃO — α baixo COM acordo bruto alto em: " + ", ".join(sem_var) + ".")
        add("  Isso NÃO é 'os avaliadores discordam'. α e ICC são razões de variância,")
        add("  e a variância entre posts está perto de zero: os avaliadores dão quase a")
        add("  mesma nota, e todos os posts merecem quase a mesma nota. Não há o que")
        add("  ordenar, então o coeficiente desaba por construção.")
        add("  No artigo, reporte o acordo bruto ao lado do α e diga por quê — um α de")
        add("  0,1 apresentado sozinho será lido como instrumento quebrado.")

    add("\n\nPERFIL DOS AVALIADORES — controle, não resultado")
    add(_fmt(raters[["avaliador", "n_respostas", *DIM_KEYS, "overall"]]))

    add("\n\n[8] ALINHAMENTO JUIZ × REFERÊNCIA HUMANA")
    add("vies_medio > 0 significa juiz mais generoso que o humano.")
    add(_fmt(alinha[["dimensao", "n", "juiz_mediana", "humano_mediana", "spearman_rho",
                     "spearman_p", "icc_a1_juiz_humano", "vies_medio", "vies_mediano",
                     "mae", "pct_exato", "pct_ate_1", "wilcoxon_p"]]))
    for _, r in alinha.iterrows():
        dim = r["dimensao"]
        if r["spearman_motivo"]:
            add("  ρ indefinido em " + dim + ": " + r["spearman_motivo"])
        if r["wilcoxon_motivo"]:
            add("  Wilcoxon em " + dim + ": " + r["wilcoxon_motivo"])

    add("\n\n[9] O JUIZ COMO GATE")
    for g in gates:
        limiar = g["limiar"]
        rotulo = "REGRA VIGENTE" if limiar == ACCEPT_MIN else "sensibilidade"
        ta, fa = g["true_accept"], g["false_accept"]
        fr, tr = g["false_reject"], g["true_reject"]
        add("\n  limiar = toda dimensão ≥ %g   (%s)" % (limiar, rotulo))
        add("    n = %d posts" % g["n"])
        add("                     humano ACCEPT   humano REJECT")
        add("    juiz ACCEPT      %13d   %13d  <- falso-aceite" % (ta, fa))
        add("    juiz REJECT      %13d   %13d" % (fr, tr))
        add("    concordância         %.3f" % g["concordancia"])
        add("    taxa de falso-aceite %.3f   (dos posts que o gate aprovou, a "
            "fração que o humano reprovaria)" % g["taxa_falso_aceite"])
        add("    sensibilidade        %.3f    especificidade  %.3f"
            % (g["sensibilidade"], g["especificidade"]))
        if np.isnan(g["kappa"]):
            add("    κ de Cohen           — " + g["kappa_motivo"])
        else:
            add("    κ de Cohen           %.3f" % g["kappa"])
            if g["kappa_motivo"]:
                add("                         (" + g["kappa_motivo"] + ")")

    add("\n\n[10] DISCORDÂNCIAS PARA INSPEÇÃO QUALITATIVA")
    if disc.empty:
        add("  nenhum falso-aceite e nenhuma diferença ≥ 2 pontos.")
    else:
        add("  %d caso(s) — detalhe em discordancias.csv" % len(disc))
        add(_fmt(disc[["post", "motivo", "dimensao", "juiz", "humano", "diferenca"]]))

    if retest is not None and not retest.empty:
        add("\n\nTETO — estabilidade do próprio juiz (teste-reteste)")
        add("O juiz não pode concordar com o humano mais do que concorda consigo mesmo.")
        add(_fmt(retest))

    add("\n\nPOR POST (referência humana × juiz)")
    cols = ["post", "n_avaliadores", "celula", *["juiz_" + d for d in DIM_KEYS],
            *["humano_" + d for d in DIM_KEYS], "juiz_overall", "humano_overall"]
    add(_fmt(ref[cols]))
    return "\n".join(L)


# ─── Demo ────────────────────────────────────────────────────────────────────


def gera_demo(destino: str, balanceado: bool) -> None:
    """
    Corpus e respostas sintéticos, para o pipeline poder ser exercitado ANTES de
    o formulário voltar de campo — que é o ponto deste modo: descobrir no dia D
    que o script quebra com três avaliadores é caro.

    O default imita o corpus real (../ACHADOS.md §4): juiz travado perto de
    4,3,4,3, ACCEPT em tudo, humano mais duro em relevância e engajamento. É o
    caso DEGENERADO — κ indefinido, Spearman sem variância — e é justamente ele
    que precisa passar sem quebrar. `--demo-balanced` gera um corpus com REJECT
    do juiz, só para exercitar os caminhos que o corpus real não alcança.
    """
    os.makedirs(destino, exist_ok=True)
    rng = np.random.default_rng(20260907)
    n = 16
    posts = [chr(65 + i) for i in range(n)]

    linhas = []
    for i, p in enumerate(posts):
        if balanceado:
            base = rng.integers(2, 6, size=4)
        else:
            ruido = rng.integers(-1, 1, size=4) * (rng.random(4) < 0.15)
            base = np.clip(np.array([4, 3, 4, 3]) + ruido, 1, 5)
        d = {k: int(v) for k, v in zip(DIM_KEYS, base)}
        linhas.append(
            {
                "post": p,
                "inCorpus": "true",
                "exclusion": "",
                "threadId": "thread_demo_%02d" % i,
                "versionId": "version_demo_%02d" % i,
                "version": 1,
                "topic": "Tópico sintético %d" % (i + 1),
                **d,
                "overall": int(np.median(list(d.values()))),
                "decision": decide({k: float(v) for k, v in d.items()}),
                "judgeModel": "gpt-4.1",
                "rubricVersion": "v2",
                "conteudo": "Texto sintético do post %s.\nSegunda linha, com quebra." % p,
            }
        )
    corpus_df = pd.DataFrame(linhas)
    corpus_df.to_csv(os.path.join(destino, "corpus.csv"), index=False, encoding="utf-8")
    corpus_df[["post", "versionId", "threadId", "version", "topic", "decision"]].to_csv(
        os.path.join(destino, "mapping-corpus.csv"), index=False, encoding="utf-8"
    )
    corpus = corpus_df.set_index("post")

    # Humanos: nota do juiz, menos um desconto por dimensão (o humano é mais
    # duro em relevância e engajamento — a hipótese do estudo), mais um viés por
    # avaliador e ruído. Gera falso-aceite sem ser programado para isso.
    desconto = {"clarity": 0.0, "relevance": -0.5, "professional": -0.1,
                "engagement": -0.6, "overall": -0.3}
    vies_rater = [0.45, 0.0, -0.45]
    ancora = {1: "Muito ruim", 2: "Ruim", 3: "Aceitável", 4: "Bom", 5: "Excelente"}

    coluna = {}
    for p in posts:
        for digito, dim in DIM_BY_DIGIT.items():
            coluna[(p, digito)] = "[%s%d] pergunta da dimensão %s" % (p, digito, dim)

    respostas = []
    for r, vr in enumerate(vies_rater):
        linha = {
            "Carimbo de data/hora": "2026-09-1%d 10:0%d:00" % (r, r),
            "Endereço de e-mail": "avaliador%d@exemplo.org" % (r + 1),
        }
        for p in posts:
            for digito, dim in DIM_BY_DIGIT.items():
                base = float(corpus.loc[p, dim])
                v = int(np.clip(round(base + desconto[dim] + vr + rng.normal(0, 0.7)), 1, 5))
                # As dimensões 1–4 voltam do Forms como a string inteira da
                # opção; a 5 (escala linear) volta como número puro. A demo
                # precisa dos dois formatos, senão não testa o parser.
                linha[coluna[(p, digito)]] = (
                    str(v) if digito == 5 else "%d — %s: âncora completa" % (v, ancora[v])
                )
        respostas.append(linha)
    pd.DataFrame(respostas).to_csv(
        os.path.join(destino, "form-responses.csv"), index=False, encoding="utf-8"
    )

    # Teste-reteste: 5 rodadas do mesmo draft, com o ruído de ~1 ponto de §2.1.
    rep = []
    for i, p in enumerate(posts):
        for _ in range(5):
            notas = {
                d: int(np.clip(corpus.loc[p, d] + rng.integers(-1, 2) * (rng.random() < 0.3), 1, 5))
                for d in DIM_KEYS
            }
            rep.append({"post": p, "versionId": "version_demo_%02d" % i, **notas,
                        "overall": int(corpus.loc[p, "overall"])})
    pd.DataFrame(rep).to_csv(
        os.path.join(destino, "judge-repeat.csv"), index=False, encoding="utf-8"
    )
    print("  demo escrita em %s (%d posts, %d avaliadores)" % (destino, n, len(vies_rater)))


# ─── main ────────────────────────────────────────────────────────────────────


AQUI = os.path.dirname(os.path.abspath(__file__))
DATA_PADRAO = os.path.normpath(os.path.join(AQUI, "..", "data"))
OUT_PADRAO = os.path.join(AQUI, "out")


def main() -> None:
    # O console do Windows abre em cp1252 e derruba o script no primeiro "⟺" do
    # relatório — depois de toda a análise ter rodado. O arquivo em out/ já sai
    # em utf-8; isto é só para o eco no terminal.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser(description="Análise do estudo do gate (rubrica v2).")
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--demo", action="store_true", help="gera e analisa dados sintéticos")
    ap.add_argument("--demo-balanced", action="store_true",
                    help="demo com REJECT do juiz (exercita κ e Spearman)")
    ap.add_argument("--accept-min", type=float, default=ACCEPT_MIN_STRICT,
                    help="piso da ANÁLISE DE SENSIBILIDADE (o gate usa piso %g "
                         "e composto %g)" % (ACCEPT_MIN, ACCEPT_COMPOSITE_MIN))
    args = ap.parse_args()

    demo = args.demo or args.demo_balanced
    data = args.data_dir or (os.path.join(DATA_PADRAO, "demo") if demo else DATA_PADRAO)
    out = args.out_dir or (os.path.join(OUT_PADRAO, "demo") if demo else OUT_PADRAO)
    os.makedirs(out, exist_ok=True)

    if demo:
        gera_demo(data, args.demo_balanced)

    avisos = Aviso()
    p_corpus = os.path.join(data, "corpus.csv")
    p_form = os.path.join(data, "form-responses.csv")
    if not os.path.exists(p_corpus) or not os.path.exists(p_form):
        sys.exit(
            "faltam entradas em %s\n"
            "  corpus.csv          GET /api/mas/export/corpus?format=csv\n"
            "  form-responses.csv  export do Google Forms\n"
            "Para exercitar o pipeline sem dados reais: python gate_study.py --demo"
            % data
        )

    print("lendo %s" % data)
    corpus = load_corpus(p_corpus, avisos)
    longo = load_form(p_form, corpus, avisos)
    print("  %d posts no corpus, %d avaliadores, %d respostas"
          % (len(corpus), longo["rater"].nunique(), len(longo)))

    p_map = os.path.join(data, "mapping-corpus.csv")
    if os.path.exists(p_map):
        load_mapping(p_map, corpus, avisos)

    retest = None
    p_rep = os.path.join(data, "judge-repeat.csv")
    if os.path.exists(p_rep):
        rep = load_judge_repeat(p_rep)
        if rep is not None:
            retest = analise_retest(rep)

    humanos = passo6_humanos(longo)
    raters = perfil_avaliadores(longo)
    gate = passo9_gate(longo, corpus, ACCEPT_MIN)
    gate_sens = passo9_gate(longo, corpus, args.accept_min)
    ref = gate["ref"]
    alinha = passo8_alinhamento(ref)
    disc = passo10_discordancias(ref, corpus)
    longo_db = human_ratings_long(longo, corpus)

    saidas = {
        "humanos_concordancia.csv": humanos,
        "avaliadores.csv": raters,
        "referencia_humana.csv": ref,
        "alinhamento.csv": alinha,
        "gate_matriz.csv": pd.DataFrame(
            [{k: v for k, v in g.items() if k != "ref"} for g in (gate, gate_sens)]
        ),
        "discordancias.csv": disc,
        "human_ratings_long.csv": longo_db,
    }
    if retest is not None:
        saidas["judge_retest.csv"] = retest
    for nome, df in saidas.items():
        df.to_csv(os.path.join(out, nome), index=False, encoding="utf-8")

    # Mapa pseudônimo → identificador original: fica só em out/ (gitignorado) e
    # não vai para o banco. É o que permite reabrir uma resposta específica sem
    # passear com e-mail dentro do dataset.
    pd.DataFrame(
        sorted({(r.rater, r.rater_raw) for r in longo.itertuples()}),
        columns=["avaliador", "identificador_original"],
    ).to_csv(os.path.join(out, "avaliadores_identidade.csv"), index=False, encoding="utf-8")

    texto = summary(avisos, humanos, raters, ref, alinha, [gate, gate_sens], disc, retest)
    with open(os.path.join(out, "summary.txt"), "w", encoding="utf-8") as f:
        f.write(texto + "\n")
    figuras(ref, gate, out)

    print("\n" + texto)
    print("\nsaídas em %s" % out)


if __name__ == "__main__":
    main()
