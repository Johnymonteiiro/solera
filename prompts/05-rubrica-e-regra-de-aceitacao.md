# 05 · Rubrica e regra de aceitação

[Índice](README.md) · [Researcher](01-researcher.md) · [Analyst](02-analyst.md) · [Writer](03-writer.md) · [Critic](04-critic.md) · **Rubrica**  
🌐 [English translation](en/05-rubric-and-acceptance-rule.md)

A rubrica é o instrumento comum ao Critic e aos avaliadores humanos. O texto abaixo é o original em português, gerado de `src/app/MAS/lib/rubric.ts` — o mesmo arquivo que alimenta o prompt do Critic. A tradução para o inglês está em [en/05-rubric-and-acceptance-rule.md](en/05-rubric-and-acceptance-rule.md) e no apêndice do artigo.

Versão da rubrica: `v2`.

## Escala

| Ponto | Rótulo |
|---|---|
| 1 | Muito ruim |
| 2 | Ruim |
| 3 | Aceitável |
| 4 | Bom |
| 5 | Excelente |

## Dimensões

### Clareza e legibilidade (`clarity`)

**Pergunta:** O post é claro, compreensível, bem estruturado e fácil de ler?

**Peso no composto:** 0.35

| Ponto | Âncora |
|---|---|
| 1 · Muito ruim | Confuso. Bloco denso ou frases longas demais; não dá para identificar a ideia central. |
| 2 · Ruim | Difícil de acompanhar. Estrutura fraca, exige releitura; a ideia só aparece no fim (ou não aparece). |
| 3 · Aceitável | Compreensível com esforço médio. Estrutura aceitável, mas há trechos densos, truncados ou repetitivos. |
| 4 · Bom | Claro e bem organizado. Leitura fluida, ideia central evidente desde cedo, quebras de linha ajudam. |
| 5 · Excelente | Excepcionalmente claro. Cada parágrafo avança a ideia, o ritmo e a formatação servem o leitor, nada sobra. |

### Relevância e valor informativo (`relevance`)

**Pergunta:** O post entrega informação significativa e substantiva, apropriada a um público profissional, e atende à intenção do tópico?

**Peso no composto:** 0.35

| Ponto | Âncora |
|---|---|
| 1 · Muito ruim | Sem valor ou fora do tema. Não informa nada e/ou não atende à intenção do tópico. |
| 2 · Ruim | Genérico. Senso comum e afirmações amplas sem substância; toca o tema de raspão. |
| 3 · Aceitável | Informação correta, porém previsível. Cobre o básico do tópico sem acrescentar muito a quem já é da área. |
| 4 · Bom | Substantivo. Traz dado, exemplo ou distinção útil e atende bem à intenção do tópico. |
| 5 · Excelente | Alto valor. Insight não óbvio, específico e acionável para o público profissional. |

### Adequação profissional (`professional`)

**Pergunta:** O tom, a linguagem e a apresentação são apropriados para uma rede social profissional e para o público pretendido?

**Peso no composto:** 0.15

| Ponto | Âncora |
|---|---|
| 1 · Muito ruim | Inapropriado. Ofensivo, sensacionalista, informal a ponto de destoar, ou promocional agressivo. |
| 2 · Ruim | Destoa. Exageros, clickbait, jargão de marketing vazio, emojis ou pontuação em excesso. |
| 3 · Aceitável | Aceitável. Nada impróprio, mas o registro oscila ou soa impessoal e genérico ("texto de IA"). |
| 4 · Bom | Apropriado. Tom profissional consistente e autêntico, linguagem adequada ao público. |
| 5 · Excelente | Exemplar. Voz profissional credível e natural, calibrada ao público, sem clichê. |

### Qualidade do engajamento (`engagement`)

**Pergunta:** O post atrai atenção, sustenta o interesse e estimula interação profissional apropriada?

**Peso no composto:** 0.15

| Ponto | Âncora |
|---|---|
| 1 · Muito ruim | Não prende. Abertura sem gancho e nada que sustente a leitura; ou pede interação de forma artificial. |
| 2 · Ruim | Fraco. Começa devagar e o interesse cai no meio; convite genérico do tipo "o que vocês acham?". |
| 3 · Aceitável | Mediano. Abertura funcional, mantém o leitor até o fim, convite presente mas pouco específico. |
| 4 · Bom | Bom. Abertura que para o scroll, interesse sustentado, convite ancorado no conteúdo do post. |
| 5 · Excelente | Excelente. A primeira linha obriga a continuar, a tensão se mantém, e o convite ativa uma experiência específica do leitor. |

### Qualidade geral (`overall`)

**Pergunta:** Considerando tudo, qual é a qualidade geral deste post?

Sem âncoras por ponto. É pedida por último e não entra na regra de aceitação.

## Regra de aceitação

A decisão é calculada em código, e não pedida ao modelo. Um post é **aceito** quando as duas condições valem:

1. **Composto ≥ 3.5**, sendo o composto a média ponderada
   0.35 × clareza e legibilidade + 0.35 × relevância e valor informativo + 0.15 × adequação profissional + 0.15 × qualidade do engajamento.
2. **Sem violação de piso:** o post é reprovado se duas dimensões ficarem abaixo de 3 e ao menos uma delas for clareza ou relevância.

Tamanho fora da faixa, link externo no corpo e pedido artificial de engajamento não mudam as notas. São verificações de conformidade separadas, que também devolvem o rascunho ao Writer.

---

[Índice](README.md) · [Researcher](01-researcher.md) · [Analyst](02-analyst.md) · [Writer](03-writer.md) · [Critic](04-critic.md) · **Rubrica**  
🌐 [English translation](en/05-rubric-and-acceptance-rule.md)
