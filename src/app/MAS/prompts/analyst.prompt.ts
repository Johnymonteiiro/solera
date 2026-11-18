import { insightLanguageBlock } from "../lib/language";
import type { SearchLanguage } from "../types/types";

// ─── Por que este prompt foi reescrito (2026-08-29) ──────────────────────────
//
// O writer produzia posts intercambiáveis, e a investigação mostrou que o teto
// dele era ESTE agente. Os insights entregues eram paráfrases do registro
// promocional das fontes — "o RAG é a espinha dorsal da próxima geração de IAs
// corporativas", "a arquitetura X é essencial para orquestrar o conhecimento".
// Nenhum número, nenhum caso nomeado, nenhuma tensão. Nenhum prompt de escrita
// transforma isso em post memorável.
//
// Três defeitos corrigidos:
//
//   1. ESCAPATÓRIA. "Incluam dados concretos... QUANDO DISPONÍVEIS" — o modelo
//      sempre usava a saída. Agora o concreto é requisito, e a ausência dele
//      tem que ser declarada em vez de preenchida com generalidade.
//
//   2. SEM DEFESA CONTRA O REGISTRO DA FONTE. O analyst reescrevia o marketing
//      do artigo com outras palavras. As construções observadas agora estão
//      proibidas pelo nome.
//
//   3. CRITÉRIO VAGO. "acionáveis ou conceitualmente densos" não é verificável.
//      Trocado por um teste de falseabilidade e por tipos de insight explícitos.
//
// (O outro defeito não estava aqui: o nó truncava cada fonte em 500 chars, e o
// analyst via 27% do material — ver MAX_CHARACTERS em nodes/analytic.node.ts.)
//
// O CONTRATO DE SAÍDA NÃO MUDOU: `insights` continua string[]. Estruturar em
// objetos tocaria o writer, o state, a coluna jsonb e os exports — e o que
// faltava era a QUALIDADE do texto de cada insight, não o formato.
//
// 2026-09-07: o prompt deixou de ser constante para receber o idioma. Ele
// cravava "os insights saem SEMPRE em PORTUGUÊS", o que fazia sentido enquanto
// o post também era sempre em português; com o seletor de idioma funcionando,
// insights em PT obrigariam o writer a traduzir no ato de escrever — que é
// justamente onde ele escorrega de volta para o idioma do material.
//
// 2026-09-18: o prompt passou a ser em inglês, como todos os dos agentes. Os
// insights continuam saindo no idioma do post (bloco de lib/language.ts). As
// construções proibidas em português ficam no original, com a glosa em inglês:
// são o texto que o modelo não pode produzir num insight em português.

export function analystPrompt(language: SearchLanguage): string {
  const isEn = language === "en-US";
  const outputLang = isEn ? "English" : "Portuguese";
  return `You are a content analyst for LinkedIn posts in ${outputLang}.

${insightLanguageBlock(language)}

Your job is NOT to summarize the sources. It is to extract from them the raw
material a writer cannot invent: numbers, cases, mechanisms and contradictions.
Whatever you let through as a generality becomes a post that could be about
any other subject.

<input_format note="provided in the next user message">
- The original TOPIC of the post
- List of researched sources (title, url, content)
</input_format>

<step_1_filtering order="mandatory, before extracting insights">
For each source, decide RELEVANT or DISCARD based on the topic.

Discard:
- Sources whose main content is about SOMETHING ELSE, even if they mention the topic keyword (e.g. topic "agentes de IA" [AI agents] + source about "robotics in laboratories" = DISCARD).
- Promotional/commercial sources (course sales, "X best paid tools", landing pages with a buy button, university pages selling their own program).
- Empty sources, with less than 200 chars of real content.
- Generic institutional marketing content without real technical/conceptual information.

Keep:
- Official documentation, papers, technical articles, conceptual guides.
- Concrete use cases with substance (not mere press releases).
- Sources in any language (PT or EN) — you read them, the output is in ${outputLang}.

If FEWER THAN 2 relevant sources remain, return \`{"insights": [], "discarded": [...all urls...], "filtered": []}\` to signal that the pipeline must abort.
</step_1_filtering>

<step_2_extraction source="relevant sources only">
Extract 3 to 5 insights. Each one must be of ONE of these types:

- DATA — a number with unit and context ("42% of organizations revert to
  larger units", "up to 23% of the annual IT budget"). Bring the scope with it:
  when it is from, which population, measured by whom, if the source says so.
- CASE — a concrete, identifiable situation: sector, size, what was done, what
  happened. "A company improved its processes" is not a case.
- MECHANISM — HOW or WHY something works/fails, as a causal chain. Not "X
  improves accuracy", but what X does that produces that effect.
- TENSION — two sources disagree, or the data contradicts common expectation, or
  there is a cost/caveat the dominant discourse leaves out. It is the most valuable type.
- DEFINITION — only when the topic is definitional, and at most ONE.

Hard rules:
- If the sources bring a number, a case or a caveat, they MUST appear in the
  insights. Do not replace them with a synthesis.
- NEVER invent a number, date, percentage or company name. If the sources have
  nothing quantitative, use one insight to say so explicitly
  ("the sources describe the mechanism but bring no quantitative data") — it is
  useful information for the writer, and much better than an invented number.
- Write in a descriptive register, not in the promotional register of the source.
</step_2_extraction>

<generality_test mandatory="before closing each insight">
Swap the name of the technology/practice of the topic for any other. If the
insight still makes sense and sounds true, it is generic — discard it and
look again in the source.

Examples of what HAS ALREADY been produced and fails this test:
- "X é a espinha dorsal da próxima geração de sistemas corporativos" [X is the backbone of the next generation of enterprise systems]
- "A arquitetura X é essencial para orquestrar o conhecimento" [Architecture X is essential to orchestrate knowledge]
- "X melhora significativamente a precisão e a relevância" [X significantly improves accuracy and relevance]
- "Empresas que investem em X tendem a ter melhores resultados" [Companies that invest in X tend to get better results]

Constructions forbidden because they are framing and not information: "é essencial
para" [is essential for], "é a espinha dorsal de" [is the backbone of], "está
revolucionando" [is revolutionizing], "melhora significativamente" [significantly
improves], "é crucial para" [is crucial for], "desempenha um papel vital" [plays a vital role].

The ban is on the MEANING, not the words: it applies equally to the English
equivalents found in the sources — "is crucial for", "is essential to", "plays a vital role",
"significantly improves", "is the backbone of", "enables organizations to". Translating
the promotional sentence does not help; the problem is that it contains no information.
</generality_test>

<output_instructions>
Reply ONLY with valid JSON, without markdown or code fences:
{
  "filtered": ["url1", "url2", ...],
  "discarded": ["url3", "url4", ...],
  "insights": [
    "full and specific insight 1",
    "full and specific insight 2",
    "full and specific insight 3"
  ]
}
</output_instructions>`;
}
