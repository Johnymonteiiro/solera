import fs from "node:fs";
import path from "node:path";
import { agentConfigs, getDb, isDbConfigured } from "@/db";
import { MAX_JUDGE_RETRIES, MAX_REVISIONS, POST_SIZE_RANGES } from "../src/app/MAS/constants";
import { composeSystemPrompt, getAgentConfig, type AgentId } from "../src/app/MAS/lib/configStore";
import {
  ACCEPT_COMPOSITE_MIN,
  ACCEPT_MIN,
  DIMENSION_WEIGHTS,
  OVERALL_QUESTION,
  RUBRIC_DIMENSIONS,
  RUBRIC_VERSION,
  SCALE_LABELS,
} from "../src/app/MAS/lib/rubric";
import { JUDGE_TEMPERATURE, getAgentModelName, getAgentTemperature } from "../src/app/MAS/models/openAI/llm";
import { currentRubricHash } from "../src/app/MAS/nodes/judge.node";
import { analystPrompt } from "../src/app/MAS/prompts/analyst.prompt";
import { judgePrompt } from "../src/app/MAS/prompts/judge.prompt";
import { RESEARCHER_PROMPT } from "../src/app/MAS/prompts/researcher.prompt";
import { writerPrompt } from "../src/app/MAS/prompts/writer.prompt";
import { searchTool } from "../src/app/MAS/tools/searchTool";
import { closeDb } from "./closeDb";

// Gera a pasta `prompts/` a partir do CÓDIGO e da config gravada no banco.
//
//   pnpm prompts:export
//
// Por que gerado e não escrito à mão: é esta pasta que o artigo cita. Um texto
// copiado diverge do prompt real no primeiro ajuste, e a divergência não dá
// erro nenhum — o leitor do artigo leria um prompt que não rodou. A versão
// anterior desta pasta (2026-08-26) já tinha virado isso: descrevia a rubrica
// v1 do juiz, que não é o instrumento do estudo.
//
// O que é renderizado de verdade: o prompt de sistema de cada agente, pela
// mesma função que o pipeline usa e com o mesmo `composeSystemPrompt` (papel +
// override vindos de `agent_configs`). O que é TRANSCRITO (e marcado assim no
// documento): os blocos que os nós montam inline — reescrita do writer, bloco
// do revisor humano, correção de coerência do juiz —, porque não são exportados.
//
// O OVERRIDE MANDA. Para researcher e analyst ele SUBSTITUI o prompt do código
// (modo "replace"). Descoberto ao gerar esta pasta pela primeira vez
// (2026-09-13): o analyst roda com um override que é a versão ANTERIOR à
// reescrita de 2026-08-29 do analyst.prompt.ts. Por isso o documento diz qual
// texto está em vigor e desde quando, em vez de apontar para o arquivo .ts.
//
// O hash do instrumento do Critic é conferido contra o das notas do estudo.

/** Hash do prompt do Critic que produziu as notas analisadas no artigo. */
const STUDY_RUBRIC_HASH = "732946eb8d5147df";
/** Janela em que os posts avaliados no estudo foram gerados. */
const CORPUS_START = new Date("2026-08-29T00:00:00Z");
const CORPUS_END = new Date("2026-09-03T00:00:00Z");
/** Idioma do estudo. O pipeline também roda em en-US (ver lib/language.ts). */
const LANG = "pt-BR" as const;

const OUT = path.join(process.cwd(), "prompts");

const P = {
  topic: "{{TÓPICO}}",
  insights: "{{INSIGHTS}}",
  post: "{{POST}}",
  nChars: "{{N_CARACTERES}}",
};

const FENCE = "````";
const block = (text: string, lang = "text") => `${FENCE}${lang}\n${text.trim()}\n${FENCE}`;
const dateBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

const FILES = {
  index: "README.md",
  researcher: "01-researcher.md",
  analyst: "02-analyst.md",
  writer: "03-writer.md",
  critic: "04-critic.md",
  rubric: "05-rubrica-e-regra-de-aceitacao.md",
} as const;

const PROMPT_FILES: Record<"researcher" | "analyst" | "writer" | "judge", string> = {
  researcher: "src/app/MAS/prompts/researcher.prompt.ts",
  analyst: "src/app/MAS/prompts/analyst.prompt.ts",
  writer: "src/app/MAS/prompts/writer.prompt.ts",
  judge: "src/app/MAS/prompts/judge.prompt.ts",
};

function nav(current: keyof typeof FILES): string {
  const items: [keyof typeof FILES, string][] = [
    ["index", "Índice"],
    ["researcher", "Researcher"],
    ["analyst", "Analyst"],
    ["writer", "Writer"],
    ["critic", "Critic"],
    ["rubric", "Rubrica"],
  ];
  return items.map(([k, label]) => (k === current ? `**${label}**` : `[${label}](${FILES[k]})`)).join(" · ");
}

function extract(text: string, re: RegExp, what: string): string {
  const m = text.match(re);
  if (!m) throw new Error(`não achei ${what} no prompt renderizado — o template mudou?`);
  return m[0];
}

async function configDates(): Promise<Map<string, Date>> {
  if (!isDbConfigured()) return new Map();
  const rows = await getDb()
    .select({ agentId: agentConfigs.agentId, updatedAt: agentConfigs.updatedAt })
    .from(agentConfigs);
  return new Map(rows.map((r) => [r.agentId, r.updatedAt]));
}

async function main() {
  const cfg = await getAgentConfig();
  const dates = await configDates();
  const today = new Date().toISOString().slice(0, 10);
  const hash = await currentRubricHash();
  const hashOk = hash === STUDY_RUBRIC_HASH;

  const ids = ["researcher", "analyst", "writer", "judge"] as const;
  const models = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await getAgentModelName(id)])));
  const temps: Record<string, number> = {
    researcher: getAgentTemperature("researcher"),
    analyst: getAgentTemperature("analyst"),
    writer: getAgentTemperature("writer"),
    judge: JUDGE_TEMPERATURE,
  };
  const mode: Record<(typeof ids)[number], "replace" | "prepend"> = {
    researcher: "replace",
    analyst: "replace",
    writer: "prepend",
    judge: "prepend",
  };

  const hasOverride = (id: AgentId) => Boolean(cfg[id].promptOverride.trim());
  const replaced = (id: (typeof ids)[number]) => hasOverride(id) && mode[id] === "replace";
  const overrides = ids.filter((id) => hasOverride(id));

  for (const id of ids) {
    const d = dates.get(id);
    console.log(`${id.padEnd(10)} override=${hasOverride(id) ? "ATIVO" : "vazio"} config atualizada em ${d?.toISOString() ?? "?"}`);
  }
  if (!hashOk) console.warn(`ATENÇÃO: hash do Critic ${hash} ≠ hash do estudo ${STUDY_RUBRIC_HASH}.`);

  const configNote = (id: (typeof ids)[number]) => {
    const c = cfg[id];
    const d = dates.get(id);
    const ov = !hasOverride(id)
      ? "vazio — vale o prompt do código"
      : mode[id] === "replace"
        ? `**ATIVO, e substitui o prompt do código.** O texto abaixo é o override; \`${PROMPT_FILES[id]}\` não é usado`
        : "**ATIVO** — colocado antes do prompt do código";
    return [
      `- **Papel** (\`agent_configs.role\`, entra como preâmbulo): ${c.role.trim() ? `“${c.role.trim()}”` : "vazio"}`,
      `- **Override** (\`agent_configs.promptOverride\`, modo \`${mode[id]}\`): ${ov}`,
      `- **Última alteração da configuração:** ${d ? dateBr(d) : "sem registro"}`,
    ].join("\n");
  };

  const sourceRow = (id: (typeof ids)[number], node: string) =>
    replaced(id)
      ? `texto do override em \`agent_configs\` (em vigor); nó em \`${node}\``
      : `\`${PROMPT_FILES[id]}\`, \`${node}\``;

  // ── Researcher ────────────────────────────────────────────────────────────
  const researcherSystem = composeSystemPrompt(cfg.researcher.role, cfg.researcher.promptOverride, RESEARCHER_PROMPT);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolShape = (searchTool.schema as any).shape as Record<string, { description?: string }>;
  const toolParams = Object.entries(toolShape)
    .map(([k, v]) => `| \`${k}\` | ${v.description ?? ""} |`)
    .join("\n");

  write(FILES.researcher, `# 01 · Researcher

${nav("researcher")}

O Researcher recebe o tópico pedido e decide quais buscas fazer na web. Ele não escreve nada para o usuário: o que o pipeline aproveita são os resultados das buscas, que seguem para o Analyst.

## Resumo

| | |
|---|---|
| Função | Reunir fontes relevantes e recentes sobre o tópico |
| Modelo | \`${models.researcher}\` |
| Temperatura | ${temps.researcher} |
| Ferramenta | \`${searchTool.name}\` |
| Entrada | mensagem do usuário com o tópico |
| Saída | a palavra \`OK\` — o pipeline lê os resultados da ferramenta, não a resposta |
| Origem do prompt | ${sourceRow("researcher", "src/app/MAS/nodes/researcher.node.ts")} |

## Como o prompt é montado

${configNote("researcher")}

## Prompt de sistema

${block(researcherSystem)}

## Mensagem do usuário

${block(P.topic)}

## Ferramenta de busca

${block(searchTool.description)}

| Parâmetro | Descrição |
|---|---|
${toolParams}

Os resultados de todas as chamadas são deduplicados e ordenados por relevância antes de chegar ao Analyst.

---

${nav("researcher")}
`);

  // ── Analyst ───────────────────────────────────────────────────────────────
  const analystSystem = composeSystemPrompt(cfg.analyst.role, cfg.analyst.promptOverride, analystPrompt(LANG));
  const analystLang = replaced("analyst")
    ? "- **Idioma:** o override é um texto fixo em português; o bloco de idioma do código (`src/app/MAS/lib/language.ts`) não é aplicado."
    : `- **Idioma:** renderizado para \`${LANG}\`, o idioma do estudo. Em \`en-US\` muda só o bloco de idioma (\`src/app/MAS/lib/language.ts\`).`;

  write(FILES.analyst, `# 02 · Analyst

${nav("analyst")}

O Analyst lê as fontes coletadas, descarta as irrelevantes ou comerciais e extrai de 3 a 5 insights sobre o tópico. É o material que o Writer vai usar.

## Resumo

| | |
|---|---|
| Função | Filtrar fontes e extrair insights |
| Modelo | \`${models.analyst}\` |
| Temperatura | ${temps.analyst} |
| Entrada | mensagem do usuário com o tópico e as fontes (até 2.000 caracteres de cada) |
| Saída | JSON \`{ filtered, discarded, insights }\` |
| Interrupção | com menos de 2 fontes relevantes, a execução para |
| Origem do prompt | ${sourceRow("analyst", "src/app/MAS/nodes/analytic.node.ts")} |

## Como o prompt é montado

${configNote("analyst")}
${analystLang}

## Prompt de sistema

${block(analystSystem)}

## Mensagem do usuário

Formato montado por \`formatPayloadForAnalyst\` (transcrito de \`analytic.node.ts\`):

${block(`TÓPICO: ${P.topic}

FONTES:
[1] {{TÍTULO_DA_FONTE}}
URL: {{URL}}
{{PRIMEIROS_2000_CARACTERES_DO_CONTEÚDO}}

[2] ...`)}

---

${nav("analyst")}
`);

  // ── Writer ────────────────────────────────────────────────────────────────
  const medium = POST_SIZE_RANGES.medium;
  const writerBase = (previousDraftBlock = "", feedbackBlock = "", range = medium) =>
    composeSystemPrompt(
      cfg.writer.role,
      cfg.writer.promptOverride,
      writerPrompt({ topic: P.topic, language: LANG, insightsList: P.insights, previousDraftBlock, feedbackBlock, targetRange: range }),
      "prepend",
    );
  const writerSystem = writerBase();
  const lengthRe = /<length_target[\s\S]*?<\/length_target>/;
  const insightsRe = /<insights[\s\S]*?<\/insights>/;

  // Transcritos de writer.node.ts, com placeholders no lugar dos valores.
  const retryBlock = `\n\nDRAFT ANTERIOR ({{DECISÃO}} do judge — geral {{OVERALL}}/5; clareza {{CLAREZA}}/5, relevância {{RELEVÂNCIA}}/5, adequação profissional {{ADEQUAÇÃO}}/5, engajamento {{ENGAJAMENTO}}/5):\n"""\n{{DRAFT_ANTERIOR}}\n"""\n\nPROBLEMAS APONTADOS PELO JUDGE:\n- {{ISSUE_1}}\n- {{ISSUE_2}}\n\nSUGESTÕES:\n- {{SUGESTÃO_1}}\n\nFALHAS DE CONFORMIDADE (obrigatório corrigir):\n- {{N_CARACTERES}} chars, fora do alvo ${medium.min}-${medium.max} — ajuste sem perder o conteúdo central\n\nReescreva mantendo o que estava bom e corrigindo os problemas apontados. Não refaça o texto do zero: o que o judge não criticou deve sobreviver. Alvo de tamanho ${medium.label} (${medium.min}-${medium.max} chars).`;
  const humanDraftBlock = `\n\nDRAFT ANTERIOR (a ser corrigido — base da reescrita):\n"""\n{{DRAFT_ANTERIOR}}\n"""`;
  const humanFeedbackBlock = `\n\nINSTRUÇÕES DO REVISOR HUMANO (prioridade absoluta):\n{{COMENTÁRIO_DO_REVISOR}}\n\nReescreva o draft anterior aplicando estas instruções. Mantenha o que estava bom e corrija APENAS o que foi apontado.`;

  const retryInsights = extract(writerBase(retryBlock), insightsRe, "<insights> da reescrita");
  const humanRender = writerBase(humanDraftBlock, humanFeedbackBlock);
  const humanHeader = humanRender.slice(0, humanRender.indexOf("Você é um ghostwriter")).trim();
  const humanInsights = extract(humanRender, insightsRe, "<insights> da revisão humana");
  const lengthBlocks = (["small", "medium", "large"] as const)
    .map((s) => {
      const r = POST_SIZE_RANGES[s];
      return `### ${r.label} (${r.min}–${r.max} caracteres)\n\n${block(extract(writerBase("", "", r), lengthRe, "<length_target>"))}`;
    })
    .join("\n\n");

  write(FILES.writer, `# 03 · Writer

${nav("writer")}

O Writer transforma os insights em um post de LinkedIn. Ele escreve a primeira versão e também as reescritas — quando o Critic reprova o texto ou quando o revisor humano pede mudanças. O prompt não repete a rubrica do Critic de propósito, para que o avaliador e o redator não se confundam.

## Resumo

| | |
|---|---|
| Função | Escrever e reescrever o post |
| Modelo | \`${models.writer}\` |
| Temperatura | ${temps.writer} |
| Entrada | prompt de sistema com tópico e insights; a lista de insights também vai como mensagem do usuário |
| Saída | somente o texto do post |
| Reescritas automáticas | até ${MAX_JUDGE_RETRIES} por reprovação do Critic |
| Revisões humanas | até ${MAX_REVISIONS} |
| Origem do prompt | ${sourceRow("writer", "src/app/MAS/nodes/writer.node.ts")} |

## Como o prompt é montado

${configNote("writer")}
- **Idioma:** renderizado para \`${LANG}\`. Em \`en-US\` o bloco de idioma muda e as listas de construções proibidas ganham a versão em inglês.
- **Tamanho:** renderizado para o tamanho ${medium.label} (${medium.min}–${medium.max} caracteres). As variações estão em [Faixas de tamanho](#faixas-de-tamanho).

## Prompt de sistema

Primeira versão do post, sem feedback:

${block(writerSystem)}

## Mensagem do usuário

${block(`1. {{INSIGHT_1}}
2. {{INSIGHT_2}}
3. {{INSIGHT_3}}`)}

## Reescrita após reprovação do Critic

Quando o post volta do Critic, o nó acrescenta o rascunho anterior, as notas, os problemas e as sugestões dentro do bloco \`<insights>\`. O restante do prompt é igual ao da primeira versão. O bloco é montado em \`writer.node.ts\` e está transcrito abaixo com placeholders:

${block(retryInsights)}

## Revisão pedida pelo humano

Quando o revisor pede mudanças, o comentário dele entra num bloco de prioridade absoluta no topo do prompt, logo depois do bloco de idioma, e o rascunho anterior entra em \`<insights>\`:

${block(humanHeader)}

${block(humanInsights)}

## Faixas de tamanho

Único bloco que muda com o tamanho pedido:

${lengthBlocks}

---

${nav("writer")}
`);

  // ── Critic ────────────────────────────────────────────────────────────────
  let judgeSystem = composeSystemPrompt(
    cfg.judge.role,
    cfg.judge.promptOverride,
    judgePrompt({ topic: P.topic, draft: P.post, postSize: "medium" }),
    "prepend",
  );
  const len = P.post.length;
  judgeSystem = judgeSystem
    .replace(`(${len} chars)`, `(${P.nChars} chars)`)
    .replace(`O post tem ${len}.`, `O post tem ${P.nChars}.`);
  if (judgeSystem.includes(`(${len} chars)`) || judgeSystem.includes(`O post tem ${len}.`)) {
    throw new Error("sobrou contagem de caracteres do placeholder no prompt do Critic");
  }

  // Transcrito de judge.node.ts (correctionBlock).
  const correction = `<correcao priority="absoluta">
Sua resposta anterior contradiz o próprio diagnóstico:

- {{DIMENSÃO}}: você citou uma issue de âncora {{ÂNCORA}} e pontuou {{NOTA}}.

Refaça a avaliação inteira. Para cada caso acima, uma das duas coisas está errada e só você sabe qual: ou a nota é alta demais para o problema que você descreveu, ou a issue foi marcada numa âncora mais grave do que o problema realmente é. Corrija o que estiver errado — não invente issue nova nem apague problema real para fechar a conta.
</correcao>`;

  write(FILES.critic, `# 04 · Critic

${nav("critic")}

O Critic (chamado de *Judge* no código e na interface) avalia cada post com a rubrica de quatro dimensões e dá uma nota geral. Ele não decide se o post é aprovado e não reescreve nada: a decisão sai de uma regra calculada em código a partir das notas, e as críticas dele voltam para o Writer.

${hashOk ? "Este é exatamente o prompt que produziu as notas do Critic analisadas no artigo (ver [hash do instrumento](#como-o-prompt-é-montado))." : "**Atenção:** o hash deste prompt não é o das notas analisadas no artigo."}

## Resumo

| | |
|---|---|
| Função | Pontuar o post e explicar os problemas encontrados |
| Modelo | \`${models.judge}\` (diferente do Writer, para reduzir o viés de autopreferência) |
| Temperatura | ${temps.judge} |
| Entrada | tópico e post no prompt de sistema; o post também vai como mensagem do usuário |
| Saída | JSON com \`issues\`, \`suggestions\`, \`hasEngagementBait\`, as quatro notas e \`overall\`, nesta ordem |
| Decisão | calculada em código — ver [Rubrica e regra de aceitação](${FILES.rubric}) |
| Hash do instrumento | \`${hash}\` ${hashOk ? "— **igual** ao das notas do estudo" : `— **DIFERENTE** do estudo (\`${STUDY_RUBRIC_HASH}\`)`} |
| Origem do prompt | ${sourceRow("judge", "src/app/MAS/nodes/judge.node.ts")}, \`src/app/MAS/lib/rubric.ts\` |

## Como o prompt é montado

${configNote("judge")}
- **Tamanho:** renderizado para o tamanho médio, o mesmo usado para pontuar o corpus do estudo. O tamanho só aparece como contexto do diagnóstico; não altera as notas.
- **Hash:** SHA-256 de papel + override + template (com tópico e post fixos), truncado em 16 caracteres. É gravado junto de cada nota no banco, o que permite saber com qual versão do prompt cada avaliação foi feita.

## Prompt de sistema

${block(judgeSystem)}

## Mensagem do usuário

${block(P.post)}

## Retentativa de coerência

Depois da resposta, o código confere se alguma nota é maior que a pior âncora que o próprio Critic citou para aquela dimensão. Se for, o prompt é reenviado uma vez com o bloco abaixo no final (transcrito de \`judge.node.ts\`). Se a contradição continuar, a nota é rebaixada para a âncora citada e o caso fica registrado.

${block(correction)}

## O que o código faz com a resposta

1. Lê o JSON (com uma nova tentativa se vier malformado).
2. Confere a coerência entre notas e âncoras, como descrito acima.
3. Calcula a decisão ACCEPT/REJECT pela [regra de aceitação](${FILES.rubric}#regra-de-aceitação).
4. Calcula por conta própria as verificações de formato (tamanho, link no corpo); \`hasEngagementBait\` é a única que vem do modelo.

---

${nav("critic")}
`);

  // ── Rubrica ───────────────────────────────────────────────────────────────
  const rubricTables = RUBRIC_DIMENSIONS.map((d) => {
    const rows = ([1, 2, 3, 4, 5] as const).map((n) => `| ${n} · ${SCALE_LABELS[n]} | ${d.anchors[n]} |`).join("\n");
    return `### ${d.label} (\`${d.key}\`)\n\n**Pergunta:** ${d.question}\n\n**Peso no composto:** ${DIMENSION_WEIGHTS[d.key]}\n\n| Ponto | Âncora |\n|---|---|\n${rows}`;
  }).join("\n\n");

  write(FILES.rubric, `# 05 · Rubrica e regra de aceitação

${nav("rubric")}

A rubrica é o instrumento comum ao Critic e aos avaliadores humanos. O texto abaixo é o original em português, gerado de \`src/app/MAS/lib/rubric.ts\` — o mesmo arquivo que alimenta o prompt do Critic. A tradução para o inglês está no apêndice do artigo.

Versão da rubrica: \`${RUBRIC_VERSION}\`.

## Escala

| Ponto | Rótulo |
|---|---|
${([1, 2, 3, 4, 5] as const).map((n) => `| ${n} | ${SCALE_LABELS[n]} |`).join("\n")}

## Dimensões

${rubricTables}

### Qualidade geral (\`overall\`)

**Pergunta:** ${OVERALL_QUESTION}

Sem âncoras por ponto. É pedida por último e não entra na regra de aceitação.

## Regra de aceitação

A decisão é calculada em código, e não pedida ao modelo. Um post é **aceito** quando as duas condições valem:

1. **Composto ≥ ${ACCEPT_COMPOSITE_MIN}**, sendo o composto a média ponderada
   ${RUBRIC_DIMENSIONS.map((d) => `${DIMENSION_WEIGHTS[d.key]} × ${d.label.toLowerCase()}`).join(" + ")}.
2. **Sem violação de piso:** o post é reprovado se duas dimensões ficarem abaixo de ${ACCEPT_MIN} e ao menos uma delas for clareza ou relevância.

Tamanho fora da faixa, link externo no corpo e pedido artificial de engajamento não mudam as notas. São verificações de conformidade separadas, que também devolvem o rascunho ao Writer.

---

${nav("rubric")}
`);

  // ── Índice ────────────────────────────────────────────────────────────────
  const row = (n: string, file: string, agent: string, fn: string, model: string, temp: number) =>
    `| ${n} | [${agent}](${file}) | ${fn} | \`${model}\` | ${temp} |`;

  // Config em arquivo anterior à migração para o banco (gitignorada; existe só
  // na máquina de quem gerou o corpus). Quando está presente, é a evidência de
  // que o override já valia ANTES dos posts do estudo.
  const legacyPath = path.join(process.cwd(), "data", "agent-config.json");
  const legacy = fs.existsSync(legacyPath)
    ? { cfg: JSON.parse(fs.readFileSync(legacyPath, "utf8")) as Record<string, { promptOverride?: string }>, mtime: fs.statSync(legacyPath).mtime }
    : null;

  const versionLine = (id: "researcher" | "analyst", label: string) => {
    if (!replaced(id)) return "";
    const d = dates.get(id);
    const sameAsLegacy = legacy ? (legacy.cfg[id]?.promptOverride ?? "") === cfg[id].promptOverride : null;
    const when = !d
      ? "sem data de alteração registrada"
      : d < CORPUS_START
        ? `última alteração em ${dateBr(d)}, antes da geração dos posts do estudo — portanto foi este o texto usado neles`
        : sameAsLegacy
          ? `a última gravação da configuração, em ${d.toISOString().slice(0, 16).replace("T", " ")} UTC, ocorreu durante a geração dos posts, mas o texto é idêntico ao da configuração em arquivo de ${dateBr(legacy!.mtime)}, anterior aos posts — portanto foi este o texto usado neles`
          : `última alteração em ${dateBr(d)}, depois do início da geração dos posts do estudo — o texto usado neles pode ter sido outro`;
    return `- **${label}.** O prompt em vigor é o override gravado na configuração (${when}). O texto de \`${PROMPT_FILES[id]}\` não é usado enquanto o override existir.`;
  };
  const writerMtime = fs.statSync(path.join(process.cwd(), PROMPT_FILES.writer)).mtime;
  const writerLine =
    writerMtime > CORPUS_END
      ? `- **Writer.** O prompt é o do código, cuja última modificação é de ${dateBr(writerMtime)}, depois da geração dos posts do estudo (29/08 a 02/09/2026). A mudança principal foi o bloco de idioma de saída, para permitir posts em inglês; a versão exata usada nos posts não está versionada.`
      : `- **Writer.** O prompt é o do código, sem modificação desde ${dateBr(writerMtime)}, antes do fim da geração dos posts do estudo.`;
  // A evidência por post vem dos checkpoints do LangGraph (model_name das
  // respostas), conferida em 2026-09-13; não é recalculada aqui.
  const writerCfgDate = dates.get("writer");
  const writerModelLine =
    writerCfgDate && writerCfgDate >= CORPUS_START && writerCfgDate < CORPUS_END
      ? `- **Modelo do Writer.** A configuração atual (\`${models.writer}\`) foi gravada em ${writerCfgDate.toISOString().slice(0, 16).replace("T", " ")} UTC, durante a geração dos posts do estudo. Pelos registros de execução, sete posts foram escritos por \`gpt-4o-2024-08-06\` e três (J, L e P) por \`gpt-4o-mini-2024-07-18\`. Researcher e Analyst usaram \`gpt-4o-2024-08-06\` e o Critic, \`gpt-4.1-2025-04-14\`.`
      : "";

  write(FILES.index, `# Prompts dos agentes

Esta pasta reúne, na íntegra, os prompts usados pelos agentes do Solera e a rubrica de avaliação. É a referência citada no artigo.

> Gerado automaticamente em ${today} por \`pnpm prompts:export\`, a partir do código e da configuração dos agentes. Não edite à mão: altere a origem e gere de novo.

## Índice

| # | Agente | O que faz | Modelo (configuração atual) | Temperatura |
|---|---|---|---|---|
${row("01", FILES.researcher, "Researcher", "Pesquisa fontes sobre o tópico", models.researcher, temps.researcher)}
${row("02", FILES.analyst, "Analyst", "Filtra as fontes e extrai insights", models.analyst, temps.analyst)}
${row("03", FILES.writer, "Writer", "Escreve e reescreve o post", models.writer, temps.writer)}
${row("04", FILES.critic, "Critic", "Avalia o post com a rubrica", models.judge, temps.judge)}
| 05 | [Rubrica e regra de aceitação](${FILES.rubric}) | Instrumento comum ao Critic e aos humanos | — | — |

### Atalhos

- Researcher: [prompt de sistema](${FILES.researcher}#prompt-de-sistema) · [ferramenta de busca](${FILES.researcher}#ferramenta-de-busca)
- Analyst: [prompt de sistema](${FILES.analyst}#prompt-de-sistema) · [mensagem do usuário](${FILES.analyst}#mensagem-do-usuário)
- Writer: [prompt de sistema](${FILES.writer}#prompt-de-sistema) · [reescrita após o Critic](${FILES.writer}#reescrita-após-reprovação-do-critic) · [revisão humana](${FILES.writer}#revisão-pedida-pelo-humano) · [faixas de tamanho](${FILES.writer}#faixas-de-tamanho)
- Critic: [prompt de sistema](${FILES.critic}#prompt-de-sistema) · [retentativa de coerência](${FILES.critic}#retentativa-de-coerência)
- Rubrica: [dimensões](${FILES.rubric}#dimensões) · [regra de aceitação](${FILES.rubric}#regra-de-aceitação)

## Como ler estes prompts

- **Idioma.** Os prompts estão em português do Brasil, o idioma em que rodaram no estudo.
- **Placeholders.** Trechos como \`${P.topic}\`, \`${P.insights}\` e \`${P.post}\` marcam o que é preenchido a cada execução.
- **Montagem.** Cada prompt de sistema começa com o papel do agente (\`PAPEL DESTE AGENTE: …\`). Depois vem o texto do código ou, se houver, o override configurado na interface, que substitui o texto do código (Researcher, Analyst) ou é colocado antes dele (Writer, Critic). ${overrides.length ? `Na geração desta pasta havia override ativo em: **${overrides.join(", ")}**.` : "Na geração desta pasta, nenhum override estava ativo."}
- **Renderizado × transcrito.** Os prompts de sistema são renderizados pelas mesmas funções que o pipeline usa. Os blocos que os nós montam na hora (reescrita do Writer, pedido do revisor humano, correção de coerência do Critic) são transcritos do código e estão sinalizados como tal.

## Agentes sem prompt

- **Revisão humana (HITL).** Pausa a execução e mostra o post e as notas ao revisor, que pode aprovar, pedir revisão com um comentário ou encerrar. O comentário vira o bloco de [revisão humana](${FILES.writer}#revisão-pedida-pelo-humano) do Writer.
- **Publisher.** Publica o post aprovado no LinkedIn e registra a publicação.

## Versões e relação com o estudo

- **Critic.** O hash do prompt gerado aqui é \`${hash}\`, ${hashOk ? "igual ao gravado nas notas do Critic analisadas no artigo. O prompt desta pasta é exatamente o que produziu aquelas notas" : `**diferente** do gravado nas notas do estudo (\`${STUDY_RUBRIC_HASH}\`). O prompt desta pasta não é o que produziu aquelas notas`}.
${versionLine("researcher", "Researcher")}
${versionLine("analyst", "Analyst")}
${writerLine}
${writerModelLine}
`);

  console.log(`\nprompts/ gerado (${Object.keys(FILES).length} arquivos) · hash do Critic ${hash} ${hashOk ? "= estudo" : "≠ estudo"}`);
}

function write(file: string, content: string) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), content.replace(/\n{3,}/g, "\n\n"), "utf8");
  console.log(`→ prompts/${file}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    process.exit();
  });
