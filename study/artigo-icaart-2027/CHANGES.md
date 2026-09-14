# Revisão do artigo ICAART 2027 — 2026-09-13

Nova versão do manuscrito `ICAART_2027___PublisherAgents.pdf`, aplicando o
parecer `melhorias.pdf` e usando as respostas reais do formulário.

## Como compilar

Não há LaTeX instalado nesta máquina, então **o `.tex` ainda não foi compilado**.
Caminho mais curto:

1. No Overleaf, criar projeto a partir do template **SCITEPRESS Conference**
   (traz `SCITEPRESS.sty` e `apalike.bst` na raiz).
2. Usar a versão de arquivo único: `overleaf/main.tex` (tabelas e macros já
   embutidas) no lugar do `main.tex` do template, e subir `overleaf/refs.bib`.
   Regerar depois de qualquer mudança: `python study/analysis/flatten_tex.py`.
3. Compilar com pdfLaTeX + BibTeX.

Se aparecer `Undefined control sequence \affiliation` / `\email`, o projeto não
está carregando o `SCITEPRESS.sty` do template (o `.sty` oficial define os dois).
O `main.tex` tem comandos de reserva que evitam o erro, mas o layout só sai
certo com o `.sty` do template.

Pacotes carregados além do template: `booktabs`, `tabularx`, `adjustbox`, `url`,
`xcolor`, `tikz`. Todos existem no Overleaf.

Conferir no primeiro build: **número de páginas** (limite da ICAART) e se a
Figura 1 (TikZ) ficou legível na largura da página.

## Números

Nenhum número do texto foi digitado. Tudo sai de `tables/macros.tex` e
`tables/*.tex`, gerados por:

```
pnpm study:critic-form                    # nota do Critic gravada → study/data/critic-scores.csv
pnpm study:critic-form --repeat 5 --go    # teste-reteste + controle truncado (PAGO, já rodado)
python study/analysis/form_agreement.py   # tabelas + macros + out/form/results.json
```

Dados usados: `study/data/form-responses.xlsx` (cópia da planilha do Forms),
`study/data/critic-scores.csv`, `study/data/critic-repeat.csv` (60 chamadas ao
gpt-4.1, 2026-09-13, hash do instrumento `732946eb8d5147df`, sem gravar no banco).

## Pendências que só o autor resolve (em vermelho no PDF)

- [ ] Como os 10 posts foram escolhidos entre os 16 do corpus (B, G, K, M, N, O ficaram fora).
- [ ] Perfil dos 18 avaliadores: recrutamento, profissão, uso do LinkedIn, língua nativa, consentimento/ética.
- [ ] Se as âncoras por ponto (Tabela do apêndice) apareceram no formulário. A planilha traz notas numéricas e o título da pergunta só com a descrição da dimensão — parece escala linear sem âncoras. **Se não apareceram, isso vira limitação importante** (o Critic recebeu as âncoras, o humano não) e o texto de §4.1 precisa mudar.
- [ ] Confirmar que a ordem dos posts foi a mesma para todos (A, J, D, L, F, P, I, E, H, C). O texto afirma isso com base na ordem das colunas.
- [x] Provedor de busca usado no corpus: **Tavily** (`app_settings.SEARCH_PROVIDER`, gravado em 28/08/2026, antes do corpus).
- [x] Snapshots dos modelos: extraídos dos checkpoints do LangGraph (ver tabela de erros factuais). O Writer não foi constante — declarado em §4.1 e Limitações.
- [ ] Link anonimizado do repositório.
- [ ] Figura 2: exportar só o painel de cima da figura original para `figures/hitl-interface.png`. Sem o arquivo o build mostra um quadro TODO no lugar.
- [ ] Autores/afiliação: o bloco está anônimo para revisão cega.

## O que mudou no resultado — ler antes de tudo

A conclusão da versão anterior ("o Critic permanece próximo do julgamento
humano") **não se sustenta** e foi invertida:

- Concordância Critic–humano = concordância esperada por acaso dada a distribuição das notas (IC da diferença inclui zero, estreito). Um preditor constante "sempre 4" concorda mais com os humanos que o Critic.
- Os **humanos também não concordam entre si além do acaso**: α ordinal ≈ 0 em todas as dimensões; diferenças entre posts explicam 3–4% da variância humana, diferenças entre avaliadores ~42–44%.
- O Critic é **estável** (teste-reteste) e **reage a degradação grosseira** (8 de 10 posts truncados rejeitados), mas dá praticamente a mesma nota a todos os posts íntegros.
- Viés: Critic mais severo em Relevância e Qualidade Geral (IC exclui zero); em Engajamento a média é menor, mas o IC inclui zero.

A mensagem do artigo passou a ser metodológica: validar um critic por
concordância percentual num corpus restrito aos posts aprovados pelo próprio
pipeline não mede alinhamento.

## Erros factuais do manuscrito anterior (não estavam no parecer)

| antes | agora | fonte |
|---|---|---|
| Implementado em Python | TypeScript + LangGraph.js | código |
| PostgresSaver | checkpointer em arquivo (extensão do `MemorySaver`); dados do estudo em PostgreSQL | `src/app/MAS/lib/checkpointer.ts` |
| GPT-4o em todos os agentes | Researcher/Analyst `gpt-4o-2024-08-06`; Writer `gpt-4o-2024-08-06` em 7 posts e **`gpt-4o-mini-2024-07-18` em J, L e P** (config do Writer mudou em 29/08 18:53 UTC, no meio da geração); **Critic `gpt-4.1-2025-04-14`, T=0,1** | checkpoints do LangGraph (`data/checkpoints.json`), `agent_configs` |
| Tavily | Tavily (confirmado na config) | `app_settings.SEARCH_PROVIDER` |
| LinkedIn API v2 | LinkedIn REST API | `tools/linkedin.ts` |
| Posts em ordem aleatória | mesma ordem para todos — TODO confirmar | planilha |
| Idioma não informado | pt-BR | corpus |
| Figura 1 com 6 critérios | redesenhada em TikZ com os 4 critérios + Overall | — |
| Nota do Critic no post D: 4,3,4,3,3 | 4,4,4,4,4 (valor gravado; a aba da planilha foi digitada à mão) | banco |

A correção do post D muda pouco os números (exata 29,86% → 31,8%), e o artigo
declara a correção em nota de rodapé.

## Parecer → onde foi tratado

### Críticos

| item | tratamento |
|---|---|
| **C1** Overall do Critic não descrito | §3.2: o Critic emite a nota holística por último, sem âncoras, fora da regra de aceitação — por isso não é a média das quatro. |
| **C2** Descrição dos dados | §4.1: 18 avaliadores, 50 notas cada (900), 180 comparações C–H e 1.530 pares H–H por dimensão, execução do Critic. |
| **C3** "Sistema original permissivo" | Removido de §2.3. Substituído em §3.3 por fato medido: a regra anterior (toda dimensão ≥ 3) aceitou 22/22 execuções na 1ª passada. A Discussão não "refuta" mais hipótese não formulada; fala de severidade medida. |
| **C4** ±1 humano–humano incompleto | Tabela 1 unificada: H–H exata/±1, C–H exata/±1, acaso exata/±1, com IC. |

### Erros pontuais (E1)

| item | tratamento |
|---|---|
| Referência cruzada 4.2 → 4.1 | Seção reescrita; escala citada onde é definida. |
| Figura 3 órfã | Removida (conteúdo absorvido por §4.1–4.2; ela também afirmava "profissionais e usuários frequentes do LinkedIn" e "testes estatísticos", sem base). |
| Figura 2 duplamente citada / página inteira | Um painel, largura de coluna, legenda só da interface HITL; §3.6 não cita mais a figura. |
| Caixa da Seção 2 | `\uppercase` em todas as seções. |
| LangChain "Acessado em maio de 2026" / ano | `refs.bib`: LangGraph.js, 2026, "Accessed: 13 September 2026". |
| Chen (2023) não localizável | **Removida**. Os dois pontos que ela sustentava agora citam Ouyang et al. e Moraes et al. (HITL) e Zheng et al./Panickssery et al. (limites de LLM-judge). |
| Moraes et al. com caracteres corrompidos | Acentos em BibTeX (`Galv{\~a}o`, `J{\'u}nior`). |
| Likert sem volume | 22(140), 1–55. |
| ReAct como "reasoning model" | "prompting paradigm"; venue corrigido para ICLR 2023. |
| Russell & Norvig para "single-turn generation" | Removida; substituída por Brown et al. (2020). |

### Metodológicos

| item | tratamento |
|---|---|
| **4.1** sem correção de chance | Acaso dado as marginais, preditor constante, κ ponderado quadrático, α de Krippendorff ordinal, Spearman por post, MAE, distribuição das notas (apêndice). ICC não reportado: α + decomposição de variância cobrem o mesmo ponto. |
| **4.2** sem incerteza | Bootstrap percentil em dois sentidos (posts e avaliadores), 2.000 réplicas; α por posts. Linguagem comparativa revisada. |
| **4.3** viés de seleção | Declarado em §4.1 e Limitações: todos aceitos na 1ª passada, 0 reescritas, nenhum passou pelo HITL. Não havia post rejeitado para avaliar; o controle truncado (RQ3) cobre parcialmente. Limiar e regra informados em §3.3. |
| **4.4** não determinismo | RQ3: 5 rodadas por post + tabela de estabilidade; temperatura e modelo informados. |
| **4.5** sem baseline / arquitetura não avaliada | **Não resolvido com experimento** (exigiria gerar corpus novo). Título, contribuições e introdução alinhados ao que foi avaliado; declarado em Limitações e Trabalhos Futuros. |
| **4.6** avaliadores e corpus | Idioma, tópicos (tabela no apêndice), tamanho, instruções, paridade de informação. Perfil dos avaliadores → TODO. |
| **4.7** reprodutibilidade | Rubrica completa no apêndice; parâmetros no texto; repositório → TODO. |

### Clareza e redação (§5)

| item | tratamento |
|---|---|
| Abstract sem números | Inclui concordância, acaso, α, decomposição de variância e RQ3. |
| Lista das 4 dimensões repetida | Definida uma vez em §3.2; demais menções só referenciam. |
| Redundância 4 / 4.1 / 4.3 / 4.3.1 | Condensado em RQs + §4.1 Posts/Raters/Procedure + §4.2 Metrics. |
| "stronger for consistently interpreted characteristics" | Removida; a variação entre dimensões é explicada pela nota quase constante do Critic. |
| Equação (1) trivial | Virou texto. |
| Nota de rodapé 2 em lugar errado | Conteúdo incorporado a §4.2 (Metrics). |
| Citação de Arunkumar para limite de iterações | Removida. |

### Trabalhos relacionados (§6)

Adicionados: Zheng et al. 2023 (MT-Bench), Liu et al. 2023 (G-Eval), Chiang & Lee 2023,
Panickssery et al. 2024 (auto-preferência — justifica Critic ≠ Writer),
Stureborg et al. 2024 (inconsistência), MetaGPT, ChatDev, AutoGen, CrewAI (nota de rodapé).
Sapkota et al. passou de 5 citações para 1.

### Perguntas aos autores (§8)

1. Overall → §3.2. 2. Limiar e 1ª passada → §3.3 e §4.1 (10/10 na 1ª passada).
3. Rejeição humana → nenhum post passou pelo HITL (§4.1). 4. Execução única, T=0,1 → §4.1 + RQ3.
5. Avaliadores e idioma → idioma respondido; perfil TODO. 6. "Original system" → §3.3.

## Conferir antes de submeter

- **Referências novas foram escritas de memória**: conferir volume/páginas de Zheng 2023,
  Liu 2023, Chiang & Lee 2023, Qian 2024, Panickssery 2024, Wu 2024 (COLM) e Hong 2024.
- A frase das Limitações "an earlier version of the Critic prompt had scored the same texts
  differently … for five of the ten posts" vem da comparação `study/data/corpus.csv`
  (juízo de 2026-08-29) × `critic-scores.csv` (2026-09-08) — é o único número do texto
  que não sai do script.
- **Prompts citados (`prompts/`)**: Researcher e Analyst rodam com `promptOverride` gravado na
  config, que SUBSTITUI o prompt do código. O do Analyst é a versão anterior à reescrita de
  29/08 do `analyst.prompt.ts` — foi ela que gerou os insights dos posts do estudo. A pasta
  documenta o texto em vigor, não o arquivo `.ts`.
- O critério de exclusão da análise de sensibilidade (≥ 50% das notas = 1) foi definido
  depois de ver os dados; está declarado como tal.
