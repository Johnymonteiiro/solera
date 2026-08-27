# Expansão dos critérios de qualidade do Judge Agent

#### Context

O judge agent do MAS hoje avalia posts em 4 dimensões (score, hookQuality, lengthAdequate, toneLinkedIn) — em src/app/MAS/prompts/judge.prompt.ts. Pesquisa de práticas LinkedIn 2026 mostrou lacunas relevantes que impactam diretamente reach e dwell time:

- Originalidade não é avaliada → posts genéricos passam.
- Scannability / readability (formatação que sustenta dwell time, o sinal #1 do algoritmo) não é avaliada.
- CTA quality não diferencia "thoughts?" de pergunta específica — comentários valem 15x mais que likes.
- Engagement bait e links externos no corpo são punidos com -60% reach pelo LinkedIn e o judge não os detecta.

O objetivo é fechar essas lacunas adicionando 3 dimensões 0-10 (originality, scannability, ctaQuality) e 2 booleans de penalidade com hard cap no score quando true (mesma mecânica da regra crítica de relevância que já existe).

#### Decisões fechadas

Conjunto completo de novos critérios: originality, scannability, ctaQuality, hasEngagementBait, hasExternalLinkInBody.
Penalidade dura: hasEngagementBait=true OU hasExternalLinkInBody=true → score máximo 4 + issue obrigatório com texto fixo (igual ao padrão da regra de relevância existente).

#### Schema do judge Agenet:

```js
export interface JudgeResult {
  score: number; // O que avalia: A qualidade geral do post. É uma nota holística que equilibra o valor do conteúdo, a escrita e a capacidade de retenção.

  hookQuality: number; // O que avalia: O Gancho (a primeira ou as duas primeiras linhas antes do botão "ver mais"). No LinkedIn, o gancho é o que faz o usuário parar o scroll.

  originality: number;  // O que avalia: O grau de autenticidade e profundidade da perspectiva trazida. Evita que o post pareça um texto genérico gerado por IA ou um clichê de "coach corporativo".

  scannability: number; // O que avalia: A escaneabilidade visual. O usuário moderno não lê, ele "escaneia" o texto com os olhos antes de decidir ler.

  ctaQuality: number;  // O que avalia: A Chamada para Ação (Call to Action) na última linha.

  lengthAdequate: boolean; // O que avalia: Se o post cumpre o tamanho estratégico configurado no postSize (curto, médio ou longo).

  toneLinkedIn: boolean; // O que avalia: A adequação cultural à rede. O tom do LinkedIn precisa equilibrar profissionalismo com vulnerabilidade e autoridade, sem parecer um relatório formal de empresa ou um post informal de Instagram.

  hasEngagementBait: boolean; // O que avalia: Presença de táticas artificiais ou "mendigagem de engajamento" (ex: "Curta se concorda, comente se discorda", ou enquetes óbvias demais). O algoritmo do LinkedIn penaliza o alcance de posts que usam esses gatilhos explícitos e artificiais.

  hasExternalLinkInBody: boolean; // O que avalia: Se o usuário colocou links externos (como para o YouTube ou Medium) diretamente no corpo do texto.

  issues: string[];//O que avalia: A lista de erros apontados identificados na avaliação anterior. Serve para alimentar a interface do usuário com feedbacks rápidos (ex: ["Falta de espaçamento", "O gancho está muito longo"]).

  suggestions: string[]; // O que avalia: O plano de ação. Para cada erro listado em issues, a IA deve fornecer uma sugestão prática de reescrita ou melhoria.
}
```

Verificação end-to-end
Type-check: pnpm tsc --noEmit deve passar (toda mudança nos consumidores é apenas leitura de novos campos opcionais já com default).
Smoke test do pipeline:
pnpm dev
Disparar POST /api/mas/run com tópico que provoca engagement bait (ex: "como conseguir mil seguidores rápido?") e verificar via GET /api/mas/state/[threadId] que judgement.hasEngagementBait retorna true quando o draft contém isca, e que score ≤ 4.
Disparar outro tópico neutro e confirmar que os 3 novos campos (originality, scannability, ctaQuality) vêm preenchidos com valores 0-10 plausíveis.
HITL UI: abrir o review-popup quando o grafo chegar ao HITL e confirmar:
Grid 3 colunas renderiza com 7 stats no total.
Chips de alerta aparecem somente quando as flags são true.
Tooltip do agent-artifact-button mostra os novos campos.
Robustez do parser: forçar (temporariamente) o LLM a devolver JSON sem um dos campos novos e confirmar que o retry de 2 tentativas em judge.node.ts:41-66 recupera ou cai em status: "error" controlado.
Regressão de routing: confirmar via log [judge] score=X/10 que posts com penalidade dura entram no loop de rewrite até MAX_JUDGE_RETRIES, depois caem no HITL como esperado.
