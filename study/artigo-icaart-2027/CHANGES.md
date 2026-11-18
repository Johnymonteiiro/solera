# Revisão do artigo ICAART 2027 — 2026-09-13

Nova versão do manuscrito `ICAART_2027___PublisherAgents.pdf`, aplicando o
parecer `melhorias.pdf` e usando as respostas reais do formulário.

## 2026-09-19 — CORREÇÃO da RQ4: o "9/10 decisões invertidas" era erro

A re-pontuação dos 10 posts do GPT (19/09 00:47) foi feita pelo **Claude
Sonnet 5**, não pelo GPT-4.1: a config do Critic tinha sido trocada na tela em
18/09 05:19, e `study-benchmark.ts` conferia só o `rubricHash` — que cobre papel
+ prompt, **não o modelo**. O efeito atribuído à "revisão do prompt" era efeito da
troca de MODELO do Critic.

Corrigido: `scoreDraft` aceita `judgeModel` explícito; o script tira modelo e hash
das notas gravadas dos braços novos, exige um só juiz e força esse modelo.
Re-pontuado com GPT-4.1:

| | aprovados | composta |
|---|---|---|
| GPT, prompt antigo | 10/10 | 3,63 |
| GPT, prompt atual | 10/10 | 3,66 |
| Claude | 10/10 | 4,20 |
| Gemini | 10/10 | 4,36 |

**Conclusão nova da RQ4:** o Critic é robusto à revisão do prompt (composta
+0,03, nenhuma decisão mudou), separa os escritores pela média (Claude +0,53,
Gemini +0,70 acima do GPT), mas **aprovou os 30 posts** — detecta diferenças que
o gate não usa. Resumo, contribuição (iii), resultados, discussão e conclusão
foram reescritos. As afirmações de "decisão depende do prompt" saíram.

**Observação não publicada:** na re-pontuação acidental, o Claude como Critic
rejeitou 9 dos 10 posts do GPT que o GPT-4.1 aprovou (mesmo prompt). É um sinal de
sensibilidade ao MODELO do Critic, mas saiu de um erro, só de um braço e com uma
execução; o CSV foi sobrescrito. Se quiser no artigo, rodar de propósito
(Claude como Critic nos 30 posts) e reportar como análise planejada.

**O parágrafo de modelos** agora distingue o Writer do corpus humano (GPT-4o/
4o-mini) do Writer da RQ4 (Claude/Gemini), diz que a busca foi Tavily em todas
as execuções e que o Critic é GPT-4.1 em todas as notas analisadas.

## 2026-09-18 — versão enxuta (foco na pergunta de pesquisa)

Pedido do João: o texto gastava espaço demais com arquitetura e implementação e
perdia o objetivo — a banca julga **se um Critic LLM é um gate de qualidade
confiável**. Corpo do texto: 6.521 → 3.958 palavras (−39%); 3 → 2 figuras;
31 → 21 referências citadas. A versão completa anterior está em
`versoes/main-2026-09-18-completo.tex` (recuperar dali o que fizer falta).

**Mudou o enquadramento:**
- Título: *Is an LLM Critic a Reliable Quality Gate? Evidence from a
  Human-in-the-Loop Multi-Agent Content Pipeline* (antes: "A Human-in-the-Loop
  Multi-Agent Architecture … and an Assessment of Its LLM Critic").
  **Confirmar se o título pode mudar** em relação à submissão.
- Contribuições: a arquitetura deixou de ser contribuição e virou o *cenário*.
  Agora: (i) protocolo de avaliação de um critic embutido no pipeline; (ii) o
  achado de concordância = acaso nos dois lados; (iii) separa escritores só pela
  média e a decisão muda com o prompt.
- Resumo reescrito em torno da pergunta e dos 4 achados.

**Saiu:**
- Related Work: histórico de agentes (ReAct/CodeAct/ChatDev/CrewAI, padrões de
  organização) e a subseção de HITL de treino (RLHF). Ficaram LLM-as-a-judge e um
  parágrafo sobre critics/checkpoints em pipelines.
- Seção de arquitetura: subseção do checkpoint HITL, **a Figura 2 (tela do HITL,
  que era TODO)**, a subseção Implementation (TypeScript, checkpointer, PostgreSQL,
  Next.js, SSE, LangSmith, Tavily, LinkedIn API) e detalhes do JSON do Critic.
  Ficaram: um parágrafo do fluxo + Figura 1 simplificada, rubrica e regra de
  aceitação (com a declaração do desvio de protocolo — essa não pode sair).
- Resultados: ICs de within-one repetidos no texto, o parágrafo separado da
  análise de sensibilidade (virou uma frase na RQ2) e detalhes de post a post do
  teste-reteste.
- Discussão: a abertura "a previous version of this study…" e a nota de rodapé
  sobre a transcrição errada do post D (histórico interno, não interessa à
  banca). As quatro observações viraram três, com título em itálico.
- Apêndice: a tabela de distribuição de notas (não era citada no texto).

**Não mudou:** nenhum número (tudo segue das macros), as tabelas de resultado, a
Figura da RQ4, as limitações essenciais e os TODOs do autor.

## 2026-09-18 — RQ4: benchmark de escritores e sensibilidade ao prompt do Critic

Acrescentado ao artigo: RQ4, parágrafo de método ("Writer benchmark"), métricas,
subseção de resultados com a **Figura `fig:benchmark`** (TikZ/pgfplots, dois
painéis) e a **Tabela `tab:benchmark`**, uma quarta observação na Discussão,
limitações, conclusão e uma frase no resumo.

**Dados.** Os 10 tópicos do formulário foram gerados de novo com Claude Sonnet 5
e Gemini 3.8 Flash como Writer (`pnpm corpus:generate --model … --go`). Os 10
posts avaliados pelos humanos foram **re-pontuados pelo Critic atual** sem gravar
no banco (`pnpm study:benchmark --go` → `study/data/benchmark-scores.csv`, 40
linhas): a nota original continua sendo a das RQ1–RQ3.

**Números** — todos de `python study/analysis/benchmark.py` →
`tables/benchmark_macros.tex` (macros `\Bm…`), `tables/benchmark.tex`,
`tables/benchmark_fig.tex`. Não digitar.

**O que os dados dizem:**
- Sob o mesmo prompt do Critic, Claude (composta 4,20) e Gemini (4,36) superam os
  posts GPT avaliados pelos humanos (3,07) em todos os 10 tópicos; Gemini × Claude
  não se separam (IC inclui zero).
- Dentro de cada escritor a nota é quase constante: Relevância = 4 nos 20 posts
  novos; o Gemini recebeu só 2 vetores de nota distintos em 10 posts.
- **Só a revisão do prompt do Critic** (tradução para inglês + papel diferente;
  mesma rubrica, âncoras e regra) muda 9 das 10 decisões nos mesmos textos:
  10/10 ACCEPT → 1/10 ACCEPT. É o resultado mais forte para a tese do artigo.

**Por que o prompt do Critic mudou:** em 2026-09-18 os prompts dos agentes
passaram a ser só do código e em inglês (antes: português, com papel/override
gravados no banco). Hash antigo `732946eb`, novo `e34fee1d`.

**Pendências novas:**
- [ ] **Compilar e contar páginas:** entraram uma figura de largura dupla, uma
  tabela e ~1 página de texto. Conferir o limite da ICAART e, se passar, cortar.
- [ ] Conferir no PDF se as legendas dos dois painéis não colidem (legenda do
  painel b tem 4 entradas em 2 colunas).
- [ ] Decidir se a RQ4 fica neste artigo ou vira trabalho separado — ela muda o
  escopo (os posts novos não têm avaliação humana).
- [ ] Os braços novos passaram pelo OpenRouter, que não devolve o snapshot datado
  do modelo; se o revisor pedir versão exata, só há o apelido e a data (18/09/2026).

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
- **Tradução dos prompts (`prompts/en/`)**: gerada em 2026-09-14 junto com `prompts/`. Desde
  2026-09-18 as duas pastas estão congeladas (o script `prompts:export` e as traduções em
  `scripts/prompt-translations/` foram removidos): os prompts do código passaram a ser em inglês
  e só do código, então a pasta é o registro do que rodou no estudo, não do sistema atual.
  A rubrica em inglês usa a mesma redação do apêndice do artigo.
- **Prompts citados (`prompts/`)**: Researcher e Analyst rodam com `promptOverride` gravado na
  config, que SUBSTITUI o prompt do código. O do Analyst é a versão anterior à reescrita de
  29/08 do `analyst.prompt.ts` — foi ela que gerou os insights dos posts do estudo. A pasta
  documenta o texto em vigor, não o arquivo `.ts`.
- O critério de exclusão da análise de sensibilidade (≥ 50% das notas = 1) foi definido
  depois de ver os dados; está declarado como tal.
