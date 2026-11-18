# Supplementary Material

**A Human-in-the-Loop Multi-Agent Architecture for Social Media Content Generation**
João José Sebastião, Andréa Bordin, Callum Berger, Stefan Sarkadi, Alison R. Panisson — *ICAART 2027*

This page has the tables and figures that were left out of the paper to fit the page limit. The section and table numbers below refer to the published paper.

| | Content | Paper section |
|---|---|---|
| [S1](#s1-scoring-rubric) | Scoring rubric, with a verbal anchor for every scale point | §3.2, Table 1 |
| [S2](#s2-evaluated-posts) | The ten evaluated posts: topic, length, Critic scores, mean human scores | §4.1, §4.3.1 |
| [S3](#s3-exact-and-within-one-agreement) | Exact and within-one agreement (human–human, Critic–human, chance) | §4.3.1, Table 2 |
| [S4](#s4-distribution-of-human-ratings) | Distribution of human ratings per post and dimension | §4.3.2 |
| [S5](#s5-writer-comparison) | Critic scores for the ten topics written by three Writers | §4.3.4, Table 3 |
| [S6](#s6-human-in-the-loop-interface) | Human-in-the-Loop reviewer interface | §3.1 |

The agent prompts are in [`prompts/`](../../prompts/README.md). They are in Brazilian Portuguese, the language the system ran in, and English translations are in [`prompts/en/`](../../prompts/en/README.md). The raw data is in [`study/data/`](../data/README.md) and the analysis scripts are in [`study/analysis/`](../analysis/README.md).

---

## S1. Scoring rubric

The Critic agent and the human evaluators used the same quality criteria and scoring rubric. It is translated here from Brazilian Portuguese. Overall Quality is asked last and has no per-point anchors, and it does not enter the acceptance rule.

### Clarity and Readability (*Cla*, weight 0.35)
*Is the post clear, understandable, well structured and easy to read?*

| Score | Anchor |
|---|---|
| 1 — Very poor | Confusing; dense block or overly long sentences, with no identifiable central idea. |
| 2 — Poor | Hard to follow; weak structure and requires re-reading; the idea appears only at the end or not at all. |
| 3 — Acceptable | Understandable with average effort; acceptable structure, but some passages are dense, truncated, or repetitive. |
| 4 — Good | Clear and well organized; fluent reading, central idea evident early, and line breaks support readability. |
| 5 — Excellent | Exceptionally clear; each paragraph advances the idea, rhythm and formatting serve the reader, and nothing is superfluous. |

### Relevance and Informational Value (*Rel*, weight 0.35)
*Does the post deliver meaningful, substantive information appropriate for a professional audience, and does it fulfil the intent of the topic?*

| Score | Anchor |
|---|---|
| 1 — Very poor | No value or off-topic; provides no information and/or does not address the topic's intent. |
| 2 — Poor | Generic; relies on common sense or broad claims without substance and only marginally addresses the topic. |
| 3 — Acceptable | Correct but predictable; covers the basics without adding much value for people in the field. |
| 4 — Good | Substantive; provides a data point, example, or useful distinction and addresses the topic's intent well. |
| 5 — Excellent | High value; provides a non-obvious, specific, and actionable insight for the professional audience. |

### Professional Appropriateness (*Pro*, weight 0.15)
*Are the tone, language and presentation appropriate for a professional social network and the intended audience?*

| Score | Anchor |
|---|---|
| 1 — Very poor | Inappropriate; offensive, sensationalist, jarringly informal, or aggressively promotional. |
| 2 — Poor | Out of place; uses exaggeration, clickbait, empty marketing jargon, excessive emojis, or punctuation. |
| 3 — Acceptable | Nothing improper, but the register fluctuates or sounds impersonal and generic. |
| 4 — Good | Appropriate; consistent and authentic professional tone with language suited to the audience. |
| 5 — Excellent | Exemplary; credible and natural professional voice, calibrated to the audience and free of clichés. |

### Engagement Quality (*Eng*, weight 0.15)
*Does the post attract attention, sustain interest and encourage appropriate professional interaction?*

| Score | Anchor |
|---|---|
| 1 — Very poor | Does not hold attention; no effective opening or sustained interest, or artificially requests interaction. |
| 2 — Poor | Weak; slow start and declining interest, with a generic invitation such as "what do you think?". |
| 3 — Acceptable | Average; functional opening and sufficient interest to reach the end, but the invitation is not very specific. |
| 4 — Good | Attention-grabbing opening, sustained interest, and an invitation anchored in the post's content. |
| 5 — Excellent | The first line compels continued reading, tension is maintained, and the invitation draws on a specific reader experience. |

### Overall Quality (holistic, not used for routing)
*Considering everything, what is the overall quality of this post?*

### Acceptance rule

The rule is computed in code; it is not elicited from the model. A post passes the automated gate and goes to human review when:

- the composite `0.35·Cla + 0.35·Rel + 0.15·Pro + 0.15·Eng` is at least **3.5**, **and**
- it is **not** the case that two dimensions score below 3 with at least one of them being *Cla* or *Rel*.

A rejected post goes back to the Writer with the Critic's issues and suggestions, for at most three automatic rewrites.

---

## S2. Evaluated posts

There are ten posts in Brazilian Portuguese, all accepted by the Critic at the first pass. For each one the table gives the topic, the length in characters, the stored Critic scores (*Cla, Rel, Pro, Eng, Overall*) and the mean human score per dimension (n = 19).

| Post | Requested topic (translated) | Original topic | Chars | Critic | Cla | Rel | Pro | Eng | Ov |
|---|---|---|---:|:---:|---:|---:|---:|---:|---:|
| A | What is technical debt and how can it be explained to non-technical people? | O que é dívida técnica e como explicá-la para quem não é da área técnica? | 896 | 4,3,4,4,3 | 4.2 | 3.9 | 4.0 | 3.6 | 3.9 |
| J | Junior programmers will no longer be hired from 2027 onwards | Programadores júnior deixarão de ser contratados a partir de 2027 | 1361 | 4,3,4,3,3 | 4.2 | 4.3 | 4.2 | 4.2 | 4.2 |
| D | Legacy code that nobody wants to touch and nobody manages to replace | Código legado que ninguém quer tocar e que ninguém consegue substituir | 1867 | 4,4,4,4,4 | 4.0 | 3.9 | 4.2 | 3.8 | 3.8 |
| L | Why do retrospective meetings change nothing? | Por que reuniões de retrospectiva não mudam nada? | 1686 | 4,3,5,3,3 | 3.9 | 3.7 | 4.2 | 3.6 | 3.7 |
| F | Technical certifications have lost value in hiring processes | Certificações técnicas perderam valor no processo de contratação | 1227 | 4,3,4,3,3 | 3.8 | 3.6 | 3.9 | 3.8 | 3.8 |
| P | A college degree is no longer of any use in the job market | Faculdade não serve mais para nada no mercado de trabalho | 1197 | 4,4,4,4,4 | 3.8 | 3.8 | 3.7 | 3.5 | 3.7 |
| I | Artificial intelligence will transform the future of work | Inteligência artificial vai transformar o futuro do trabalho | 1309 | 4,3,4,3,3 | 3.7 | 3.9 | 3.6 | 3.7 | 3.9 |
| E | How to double a development team's productivity in 30 days? | Como dobrar a produtividade do time de desenvolvimento em 30 dias? | 938 | 4,3,4,3,3 | 3.9 | 3.5 | 3.9 | 3.4 | 3.6 |
| H | What is the future of programming? | Qual é o futuro da programação? | 1555 | 4,3,4,3,3 | 3.7 | 3.5 | 3.7 | 3.5 | 3.6 |
| C | Daily stand-up meetings have become an empty ritual in most tech teams | Reuniões diárias em pé viraram ritual vazio na maior parte dos times de tecnologia | 1183 | 4,3,4,3,3 | 4.2 | 3.7 | 4.2 | 3.7 | 3.9 |

The full texts of the posts are in [`study/data/corpus.csv`](../data/corpus.csv) (column `conteudo`).

---

## S3. Exact and within-one agreement

This table gives exact and within-one (±1) agreement between pairs of human evaluators, between the Critic and human evaluators, and the level expected by chance for Critic–human comparisons given the observed score distributions. For human–human pairs, chance exact agreement is 29.0%. The confidence intervals come from the two-way bootstrap (posts × evaluators, 2,000 replicates).

| Dimension | Human–Human exact | Human–Human ±1 | Critic–Human exact | Critic–Human ±1 | Chance (C–H) exact | Chance (C–H) ±1 |
|---|---:|---:|---:|---:|---:|---:|
| Clarity and Readability | 32.5% | 71.5% | 40.0% | 90.0% | 40.0% | 90.0% |
| Relevance and Informational Value | 27.5% | 66.6% | 21.1% | 66.3% | 19.9% | 65.4% |
| Professional Appropriateness | 30.9% | 74.2% | 41.1% | 88.9% | 41.3% | 89.1% |
| Engagement Quality | 25.7% | 64.4% | 21.6% | 66.8% | 23.6% | 67.7% |
| **Four dimensions** | **29.1%** | **69.2%** | **30.9%** | **78.0%** | **31.2%** | **78.0%** |
| 95% CI | 21.7%–37.3% | 56.3%–81.3% | 22.3%–39.9% | 66.8%–87.7% | | |
| Overall Quality | 27.4% | 67.4% | 22.6% | 67.9% | 23.3% | 67.7% |

---

## S4. Distribution of human ratings

![Distribution of human ratings](figures/s4-human-ratings-distribution.png)

**Figure S4.** Distribution of the human evaluators' ratings for each post and quality criterion (n = 19). Each stacked bar shows how many evaluators gave each score on the 1–5 scale. Letters are abstract post identifiers (see S2).

---

## S5. Writer comparison

![Writer comparison](figures/s5-writer-comparison.png)

**Figure S5.** Critic scores for the ten topics written by three Writers.
**(a)** Mean score per dimension under the current Critic prompt, with 95% bootstrap intervals over posts.
**(b)** Composite score per post; the horizontal line is the acceptance threshold. Open gray circles are the original scores of the human-rated posts (prompt `732946eb`). Filled markers use the current prompt (`e34fee1d`), so the distance between an open circle and the blue dot of the same post is the effect of the prompt revision alone. The exact values are in Table 3 of the paper.

---

## S6. Human-in-the-Loop interface

These screenshots come from an illustrative run; the post is not one of the ten evaluated posts. In the interface and in the code, the Critic agent is labeled **Judge**.

![HITL feedback](figures/s6a-hitl-feedback.png)

**Figure S6a.** After the automated gate, the reviewer sees the draft with the Critic's scores and the counters for automatic rewrites and human revisions. The reviewer can publish the draft, cancel it, or send free-text feedback, which routes it back to the Writer.

![HITL revision](figures/s6b-hitl-revision.png)

**Figure S6b.** The same run after the requested revision. The Writer and the Critic process the feedback, here after two automatic rewrites, before the draft returns to the reviewer.
