# Arquitetura dos Agentes — Solera MAS

> Material de apresentação. Explica como o sistema multi-agente (MAS) do Solera funciona:
> o fluxo, a máquina de estados, qual agente é o *LLM-as-judge*, como se comunicam e qual
> arquitetura cada agente usa (ReAct vs. Chain-of-Thought).

---

## 1. Visão geral

O **Solera MAS** é um pipeline de **6 agentes** que transforma um *tópico* numa publicação
de LinkedIn com qualidade algorítmica — pesquisando fontes, extraindo insights, escrevendo,
avaliando, passando por revisão humana e publicando.

**Stack:**

| Camada | Tecnologia |
|---|---|
| Orquestração | **LangGraph** (`StateGraph`) + checkpointer `MemorySaver` |
| LLM | OpenAI **gpt-4o** (via `createAgent` da LangChain) |
| Pesquisa web | **Tavily** (ou Brave) — tool `search_web` |
| Publicação | **LinkedIn Posts API** `v202509` |
| Frontend ↔ Backend | **SSE** (streaming) + polling de snapshot + Route Handlers Next.js |
| Persistência | `threadStore` (`data/threads.json`) + `publishedPostsStore` (`data/published-posts.json`) |

O grafo roda em **background** (fire-and-forget): a API dispara e o frontend acompanha por
streaming. No meio do caminho há um **ponto de pausa para revisão humana** (HITL) que
interrompe o grafo até o usuário decidir.

---

## 2. Os 6 agentes

O pipeline é: **researcher → analyst → writer → judge → hitl → publisher**.

### 🔍 Researcher — `src/app/MAS/nodes/researcher.node.ts`
- **Responsabilidade:** pesquisa a web sobre o tópico (2–3 buscas em PT e EN), deduplica e
  rankeia até 10 fontes. Se vier **0 resultado**, aborta o pipeline (`status: "stopped"`,
  `stoppedReason: "no_research_results"`).
- **Modelo:** gpt-4o (temp 0.3), via `createAgent`.
- **Tools:** `search_web` (Tavily/Brave).
- **Padrão:** **ReAct** — é o único agente com loop de *tool-calling* (pode refinar a query e
  buscar várias vezes).
- **State:** lê `topic`; escreve `researchResults`, `status`, `stoppedReason`.

### 🧠 Analyst — `src/app/MAS/nodes/analytic.node.ts`
- **Responsabilidade:** filtra fontes (descarta viés comercial/landing pages) e extrai **3–5
  insights**. Se sobrarem menos de 2 fontes, segue com insights vazios (o writer trata).
- **Modelo:** gpt-4o, via `createAgent`. **Sem tools.**
- **Padrão:** *single-shot* com saída JSON (`{ filtered, discarded, insights }`).
- **State:** lê `researchResults`, `topic`; escreve `insights`, `status`.

### ✍️ Writer — `src/app/MAS/nodes/writer.node.ts`
- **Responsabilidade:** escreve ou **reescreve** o draft do post. Trata 3 contextos:
  1. **Primeiro draft** (a partir dos insights),
  2. **Retry do judge** (corrige `issues`/`suggestions`),
  3. **Revisão humana** (segue `humanFeedback.comments` — *prioridade máxima*).
  Respeita os ranges de tamanho (`POST_SIZE_RANGES`) e trunca em `LINKEDIN_MAX_CHARS` (3000).
- **Modelo:** gpt-4o, via `createAgent`. **Sem tools.**
- **Padrão:** **Chain-of-Thought** *single-shot*.
- **Destaque — HUMAN OVERRIDE:** quando há feedback humano, o prompt injeta um bloco
  *"🚨 HUMAN OVERRIDE — PRIORIDADE MÁXIMA"* dizendo ao modelo para **sobrepor as boas práticas
  do LinkedIn** se o humano pedir (ex.: incluir uma URL no corpo do post, mesmo que o judge penalize).
- **State:** lê `topic`, `insights`, `draft`, `humanFeedback`, `judgement`, `postSize`,
  `judgeRetries`, `lastAppliedFeedbackAt`; escreve `draft`, `status`, `revisionCount` (+1 só em
  revisão humana fresca), `judgeRetries` (+1 em retry do judge), `lastAppliedFeedbackAt`.

### ⚖️ Judge — `src/app/MAS/nodes/judge.node.ts` — **o LLM-as-judge**
- **Responsabilidade:** avalia o draft contra as boas práticas do LinkedIn e devolve uma
  crítica estruturada. É o **portão de qualidade**.
- **Modelo:** gpt-4o (temp alvo 0.1), via `createAgent`. **Sem tools.**
- **Padrão:** **LLM-as-judge** com *structured output* (`JudgeSchema`).
- **Critérios (0–10):** `score`, `hookQuality`, `originality`, `scannability`, `ctaQuality`.
- **Flags booleanas (penalidade -60% de reach → forçam `score ≤ 4`):**
  - `hasEngagementBait` — *"comenta SIM", "marque 3 amigos", "deixe um ✅"* etc. (perguntas
    genuínas ancoradas no conteúdo **não** contam como bait).
  - `hasExternalLinkInBody` — link `http(s)` no corpo (LinkedIn manda mover pro 1º comentário).
- **Saída:** `issues[]` e `suggestions[]`.
- **Gate:** `score ≥ 7` → libera pro HITL; `score < 7` → volta pro writer (até `MAX_JUDGE_RETRIES`).
- **State:** lê `topic`, `draft`, `postSize`; escreve `judgement`, `status`.

### 🙋 HITL (Human-in-the-Loop) — `src/app/MAS/nodes/hitl.node.ts`
- **Responsabilidade:** **pausa** o grafo e espera a decisão humana. Sem LLM — é controle puro.
- **Mecanismo:** `interrupt({ draft, judgement, revisionCount, judgeRetries, stuck })`. O grafo
  fica parado até `POST /api/mas/review` retomar com a decisão.
- **Decisões (`HumanDecision`):** `approve` → publisher · `reject` → writer (com comments) ·
  `restart_research` → researcher (zera judgement/draft) · `stop` → END.
- **`stuck`:** sinaliza `true` quando `judgeRetries ≥ MAX_JUDGE_RETRIES` (o LLM não convergiu).

### 🚀 Publisher — `src/app/MAS/nodes/publisher.node.ts`
- **Responsabilidade:** publica o draft aprovado no LinkedIn e salva o post no store.
- **Sem LLM.** **Tool:** `publishPost` (`src/app/MAS/tools/linkedin.ts`, API `v202509`).
- **State:** lê `draft`, `topic`, `language`, `postSize`; escreve `finalPostUrl`, `status`.
  O `accessToken` (OAuth) chega via `configurable` da chamada de review.

---

## 3. Arquitetura: ReAct vs. Chain-of-Thought

O MAS **mistura padrões** conforme a função de cada agente:

- **ReAct (Reason + Act):** só o **Researcher**. Ele raciocina, chama a tool `search_web`,
  observa o resultado e pode buscar de novo — um loop de *tool-calling* clássico.
- **LLM-as-judge:** o **Judge**. Em vez de gerar conteúdo, ele *julga* o conteúdo de outro
  agente, devolvendo nota + flags estruturadas. É o que permite o loop automático de qualidade.
- **Chain-of-Thought / single-shot:** **Analyst** e **Writer**. Uma única passada do modelo
  (sem tools), com raciocínio guiado pelo prompt e saída direta (texto ou JSON).
- **Sem LLM (controle/ação):** **HITL** (interrupt) e **Publisher** (efeito colateral / API).

> Em resumo: é um grafo **orquestrado** (LangGraph decide o roteamento por arestas
> condicionais), não um único agente "autônomo". O ReAct fica contido no nó de pesquisa.

> **Nota (corrigido):** o judge roda em `getJudgeLlm()` — `temperature: 0.1`, ideal para
> julgar de forma determinística. Uma versão anterior deste doc dizia que o `createAgent`
> acabava usando o `base_llm` (0.3); não é mais o caso (`judge.agent.ts`).
> Mesmo a 0.1 a nota **não é determinística** — por isso o estudo mede test-retest via
> `GET /api/mas/export/judge-repeat` (ver `study/COLETA.md`).

---

## 4. Como os agentes se comunicam

**Não há mensagem direta entre agentes.** Todos leem e escrevem um **estado compartilhado**
(*shared state*) do LangGraph. O roteamento entre nós é feito por **arestas condicionais**.

### Canais do State (`src/app/MAS/states/states.ts`)

| Canal | Tipo de canal | Quem escreve |
|---|---|---|
| `topic`, `language`, `postSize`, `navigatorProvider` | overwrite | entrada (run) |
| `researchResults` | **acumula** (reducer) | researcher |
| `insights` | **acumula** (reducer) | analyst |
| `draft` | overwrite | writer |
| `judgement` | overwrite | judge |
| `humanFeedback` | overwrite | hitl |
| `revisionCount` | **soma** (reducer) | writer |
| `judgeRetries` | overwrite | writer |
| `status`, `stoppedReason`, `finalPostUrl` | overwrite | vários |
| `messages` | **acumula** (`messagesStateReducer`) | agentes LLM |

### Fluxo de comunicação com o frontend (end-to-end)

1. `POST /api/mas/run` → cria a thread, dispara `graph.invoke(...)` em **background** e devolve
   o `threadId` na hora.
2. `GET /api/mas/stream/[threadId]` → **SSE**: replay dos eventos passados + novos eventos +
   keepalive a cada 15s; fecha em `done`/`error`.
3. `GET /api/mas/state/[threadId]` → snapshot do estado (recuperação ao dar refresh na página).
4. `POST /api/mas/review` → retoma o grafo pausado:
   `graph.invoke(new Command({ resume: feedback }), { configurable: { thread_id, accessToken } })`.

---

## 5. Máquina de estados

11 status (`AgentStatus` em `src/app/MAS/types/types.ts`):

| Status | Significado | Terminal? |
|---|---|---|
| `idle` | criado, ainda não iniciou | — |
| `researching` | researcher buscando fontes | — |
| `analyzing` | analyst extraindo insights | — |
| `writing` | writer no 1º draft | — |
| `judging` | judge avaliando | — |
| `awaiting_review` | pausado, esperando humano (HITL) | — |
| `revising` | writer reescrevendo (retry ou feedback) | — |
| `publishing` | publisher enviando ao LinkedIn | — |
| `done` | publicado ✅ | **sim** |
| `stopped` | encerrado (cancelado / sem fontes / max retries) | **sim** |
| `error` | falha | **sim** |

**Guard-rails (anti-loop infinito):**
- `MAX_JUDGE_RETRIES = 3` → teto das reescritas automáticas writer↔judge; ao estourar, força HITL.
- `MAX_REVISIONS = 3` → teto das revisões pedidas pelo humano; ao estourar, encerra (END).
- `GRAPH_RECURSION_LIMIT = 60` → teto absoluto de iterações do grafo.
- `StoppedReason`: `no_research_results` · `user_cancel` · `max_judge_retries`.

---

## 6. Diagramas (Eraser) — copiar e colar em [eraser.io](https://app.eraser.io)

> Cole cada bloco abaixo em um diagrama do Eraser (modo *diagram-as-code*).

### (a) Fluxo do pipeline

```eraser
title Solera MAS — Fluxo do Pipeline

Start [shape: oval, icon: play]
Researcher [icon: search, color: blue]
hasResults [shape: diamond, label: "achou fontes?"]
Analyst [icon: filter, color: blue]
Writer [icon: edit-3, color: green]
Judge [icon: scale, color: orange, label: "Judge (LLM-as-judge)"]
scoreGate [shape: diamond, label: "score ≥ 7 ou retries ≥ 3?"]
HITL [icon: user-check, color: purple, label: "HITL (revisão humana)"]
decision [shape: diamond, label: "decisão humana"]
Publisher [icon: linkedin, color: green]
End [shape: oval, icon: check-circle]
Stopped [shape: oval, icon: x-circle, color: red]

Start > Researcher
Researcher > hasResults
hasResults > Analyst: sim
hasResults > Stopped: não (0 fontes)
Analyst > Writer
Writer > Judge
Judge > scoreGate
scoreGate > Writer: score < 7 (retry, máx 3)
scoreGate > HITL: aprovado p/ revisão
HITL > decision
decision > Publisher: approve
decision > Writer: reject (máx 3 revisões)
decision > Researcher: restart_research
decision > End: stop / máx revisões
Publisher > End
```

> **Fala:** "O fluxo é linear até o Judge. O Judge cria um *loop automático de qualidade* com
> o Writer (até 3 tentativas). Depois um humano decide: publicar, pedir revisão, refazer a
> pesquisa ou encerrar."

### (b) Máquina de estados

```eraser
title Solera MAS — Máquina de Estados

idle [shape: oval]
researching [color: blue]
analyzing [color: blue]
writing [color: green]
judging [color: orange]
awaiting_review [color: purple, label: "awaiting_review (pausa HITL)"]
revising [color: green]
publishing [color: teal]
done [shape: oval, color: green, icon: check-circle]
stopped [shape: oval, color: red, icon: x-circle]
error [shape: oval, color: red, icon: alert-triangle]

idle > researching: run
researching > analyzing: fontes encontradas
researching > stopped: 0 fontes
analyzing > writing
writing > judging
judging > revising: score < 7 (retry)
revising > judging
judging > awaiting_review: score ≥ 7 / max retries
awaiting_review > publishing: approve
awaiting_review > revising: reject
awaiting_review > researching: restart_research
awaiting_review > stopped: stop / max revisões
publishing > done
researching > error
analyzing > error
writing > error
judging > error
publishing > error
```

> **Fala:** "São 11 estados. Três são terminais: `done`, `stopped` e `error`. O `awaiting_review`
> é o único onde o sistema fica *parado* esperando uma pessoa."

### (c) Sequência — comunicação end-to-end com HITL

```eraser
title Solera MAS — Sequência (com revisão humana)

Usuario [icon: user]
Frontend [icon: monitor]
API [icon: server, label: "Next.js Route Handlers"]
Graph [icon: git-branch, label: "LangGraph"]
LinkedIn [icon: linkedin]

Usuario > Frontend: define tópico + tamanho
Frontend > API: POST /api/mas/run
API > Graph: graph.invoke() (background)
API > Frontend: { threadId }
Frontend > API: GET /api/mas/stream/[threadId] (SSE)
Graph > API: eventos (researching → analyzing → writing → judging)
API > Frontend: SSE status updates
Graph > API: awaiting_review (draft + judgement)
API > Frontend: SSE awaiting_review
Frontend > Usuario: mostra draft + nota do Judge
Usuario > Frontend: approve / reject+comments / stop
Frontend > API: POST /api/mas/review
API > Graph: Command({ resume: feedback }) + accessToken
Graph > LinkedIn: publishPost() (se approve)
LinkedIn > Graph: postUrl
Graph > API: done (finalPostUrl)
API > Frontend: SSE done
Frontend > Usuario: post publicado ✅
```

> **Fala:** "O run é assíncrono: a API responde na hora com um `threadId` e o front acompanha por
> SSE. O pulo do gato é o `interrupt()` do HITL — o grafo congela e só retoma quando o `/review`
> manda um `Command resume` com a decisão humana."

### (d) Arquitetura por agente (modelo · tools · padrão)

```eraser
title Solera MAS — Arquitetura por Agente

Estado [icon: database, color: gray, label: "Shared State (LangGraph)\ncanais: topic, researchResults,\ninsights, draft, judgement,\nhumanFeedback, status..."]

ReAct [color: blue] {
  Researcher [icon: search, label: "Researcher\ngpt-4o · ReAct\ntool: search_web"]
  Tavily [icon: globe, label: "Tavily / Brave"]
}

CoT [color: green, label: "Single-shot / Chain-of-Thought"] {
  Analyst [icon: filter, label: "Analyst\ngpt-4o · JSON\nfiltra + extrai insights"]
  Writer [icon: edit-3, label: "Writer\ngpt-4o · CoT\nHUMAN OVERRIDE no prompt"]
}

Judge [color: orange] {
  Judge [icon: scale, label: "Judge\ngpt-4o · LLM-as-judge\nscore 0–10 + flags"]
}

Controle [color: purple, label: "Controle / Ação (sem LLM)"] {
  HITL [icon: user-check, label: "HITL\ninterrupt()"]
  Publisher [icon: linkedin, label: "Publisher\nLinkedIn API v202509"]
}

Researcher > Tavily: query
Researcher <> Estado
Analyst <> Estado
Writer <> Estado
Judge <> Estado
HITL <> Estado
Publisher <> Estado
Publisher > LinkedIn
LinkedIn [icon: linkedin]
```

> **Fala:** "Os agentes não conversam direto — todos leem e escrevem o mesmo *shared state*.
> Cada um tem um papel: o Researcher é ReAct (usa ferramenta), Analyst e Writer são single-shot,
> o Judge é o juiz, e HITL/Publisher são controle e ação, sem LLM."

---

## 7. Resumo de 30 segundos (para abrir a apresentação)

> "O Solera é um **pipeline de 6 agentes** em LangGraph que escreve posts de LinkedIn. Um
> **Researcher** (ReAct) pesquisa fontes, um **Analyst** extrai insights, um **Writer** redige,
> e um **Judge** atua como **LLM-as-judge** dando nota de 0 a 10 — se a nota for baixa, volta pro
> Writer automaticamente (até 3x). Quando passa, entra um **humano** (HITL) que aprova, pede
> revisão ou encerra; aprovado, o **Publisher** publica no LinkedIn. Tudo é coordenado por um
> **estado compartilhado** e o frontend acompanha em tempo real por **SSE**."
