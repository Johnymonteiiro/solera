# Análise do estudo Agent-as-judge

Calcula a concordância entre o Judge (LLM-as-judge) e os avaliadores humanos (RQ1) e o
efeito de usar o Judge (com vs sem) na qualidade percebida (RQ2).

Status da coleta e checklist do que falta: `../COLETA.md`.

## Setup

```bash
cd study/analysis
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
```

## Testar o pipeline sem dados reais

```bash
python quality_study.py --demo
```

Gera dados sintéticos em `study/data/demo/` e escreve as saídas em `out/demo/`.
**Não toca em `study/data/`** — rodar a demo nunca sobrescreve a coleta real.

## Rodar com dados reais

Coloque em `study/data/`:

1. **`agent-metrics.csv`** — `GET /api/mas/export/agent-metrics?format=csv`.
   Já traz `post`, `threadId`, `condition` e `topic`, então a junção com o form é
   direta pela letra do post. (Há `?format=xlsx` para conferir no Excel; o script lê o CSV.)
2. **`form-responses.csv`** — export do Google Forms (1 linha por avaliador), colunas no
   padrão `<POST>_<criterio>`: `A_overall, A_hook, A_originality, A_scannability,
   A_cta, A_bait, A_link` (ver `../FORM-AVALIACAO.md`).
3. **`mapping.csv`** *(opcional)* — `GET ...?format=mapping`. Redundante por design: sai
   do mesmo endpoint, e o script avisa se divergir do `agent-metrics.csv` (sinal de
   edição à mão).
4. **`judge-repeat.csv`** *(opcional)* — `GET /api/mas/export/judge-repeat?n=5&format=csv`.
   Re-pontua os mesmos drafts n vezes para medir a estabilidade do juiz. Gasta LLM.

Depois:

```bash
python quality_study.py
```

## O que é calculado

**RQ1 — o juiz é um avaliador válido?**

| Saída | Conteúdo |
|---|---|
| `rq1_agreement.csv` | Por critério 0–10: Spearman, Pearson, **ICC(2,1) juiz×humano**, viés médio, MAE, % dentro de ±1/±2 |
| `rq1_flags_kappa.csv` | Flags `hasEngagementBait` / `hasExternalLinkInBody`: **Cohen's kappa** contra o voto majoritário (n = posts) e contra cada avaliador empilhado (n = posts × avaliadores, mais estável) |
| `human_reliability.csv` | **ICC(2,1) e ICC(2,k) entre os humanos** — o piso: se eles discordam entre si, a média deles é um ground truth ruidoso |
| `judge_retest.csv` | **Estabilidade do juiz**: desvio e amplitude entre rodadas no mesmo draft, ICC test-retest, e % de posts em que as flags não oscilaram |

Por que ICC além de Spearman: correlação mede se os dois **ordenam** os posts igual;
ICC mede se dão a **mesma nota**. Um juiz que dá sempre 2 pontos a mais que os humanos
tem Spearman perfeito e concordância ruim — a coluna `vies_medio` isola exatamente isso.

**RQ2 — o loop do judge melhora a qualidade percebida?**

| Saída | Conteúdo |
|---|---|
| `rq2_ab.csv` | Duas linhas: pareado por **tópico** (n = tópicos, o desenho declarado) e por **avaliador** (n = avaliadores). Cada uma com delta, IC95, `cohen_dz`, `rank_biserial` e Wilcoxon |
| `rq2_por_topico.csv` | Nota humana média por tópico × condição |
| `rq2_por_avaliador.csv` | Média com/sem e delta de cada avaliador |

O pareamento **por avaliador** é legítimo (cada pessoa avalia todos os posts, então é
medida repetida) e tem muito mais potência que os poucos pares por tópico. Reporte os
dois: o por tópico responde à pergunta como ela foi registrada, o por avaliador é o que
tem chance de atingir significância.

**Figuras:** `fig_scatter_agent_vs_human.png` (com barras de desvio entre avaliadores),
`fig_ab_com_vs_sem.png`, `fig_delta_por_avaliador.png`, `fig_judge_retest.png`.
**`summary.txt`** repete tudo em texto, pronto para colar no artigo.

## Interpretação

- **RQ1:** Spearman alto **e** MAE/viés baixos → o Judge é um juiz válido. Leia sempre
  contra o `human_reliability.csv`: concordância juiz×humano próxima do ICC entre os
  próprios humanos significa "o juiz é tão bom quanto mais um avaliador da turma" — que
  é a afirmação forte e defensável do artigo.
- **RQ2:** delta positivo → o loop melhora a qualidade percebida. Com n pequeno,
  reporte tamanho de efeito e trate o p-valor com cautela (declare como limitação).
- **Kappa das flags** é o teste mais duro do juiz: são decisões binárias com penalidade
  dura no score (`≤ 4`). Kappa baixo aqui compromete o gate inteiro, mesmo com
  correlação alta nas notas contínuas.
