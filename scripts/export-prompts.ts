import { createHash } from "node:crypto";
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

// Gera a pasta `prompts/` a partir do CÓDIGO e da config gravada no banco, e a
// tradução para o inglês em `prompts/en/`.
//
//   pnpm prompts:export             → gera tudo; avisa tradução ausente ou desatualizada
//   pnpm prompts:export --stamp     → idem, e carimba nas traduções o hash do original atual
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
// TRADUÇÕES. A tradução não se gera: fica em scripts/prompt-translations/en/,
// um arquivo por bloco, com o hash do bloco em português que ela traduz. Mudou
// o original, o hash não bate e a página em inglês ganha um aviso — em vez de
// uma tradução velha passando por atual. `--stamp` é para usar SÓ logo depois
// de revisar a tradução contra o original novo.

/** Hash do prompt do Critic que produziu as notas analisadas no artigo. */
const STUDY_RUBRIC_HASH = "732946eb8d5147df";
/** Janela em que os posts avaliados no estudo foram gerados. */
const CORPUS_START = new Date("2026-08-29T00:00:00Z");
const CORPUS_END = new Date("2026-09-03T00:00:00Z");
/** Idioma do estudo. O pipeline também roda em en-US (ver lib/language.ts). */
const LANG = "pt-BR" as const;

const STAMP = process.argv.includes("--stamp");
const OUT = path.join(process.cwd(), "prompts");
const OUT_EN = path.join(OUT, "en");
const TR_DIR = path.join(process.cwd(), "scripts", "prompt-translations", "en");

const P = {
  topic: "{{TÓPICO}}",
  insights: "{{INSIGHTS}}",
  post: "{{POST}}",
  nChars: "{{N_CARACTERES}}",
};

const FENCE = "````";
const block = (text: string, lang = "text") => `${FENCE}${lang}\n${text.trim()}\n${FENCE}`;
const dateBr = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const dateIso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const FILES = {
  index: "README.md",
  researcher: "01-researcher.md",
  analyst: "02-analyst.md",
  writer: "03-writer.md",
  critic: "04-critic.md",
  rubric: "05-rubrica-e-regra-de-aceitacao.md",
} as const;

const FILES_EN: Record<keyof typeof FILES, string> = {
  index: "README.md",
  researcher: "01-researcher.md",
  analyst: "02-analyst.md",
  writer: "03-writer.md",
  critic: "04-critic.md",
  rubric: "05-rubric-and-acceptance-rule.md",
};

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
  const links = items.map(([k, label]) => (k === current ? `**${label}**` : `[${label}](${FILES[k]})`)).join(" · ");
  return `${links}  \n🌐 [English translation](en/${FILES_EN[current]})`;
}

function navEn(current: keyof typeof FILES): string {
  const items: [keyof typeof FILES, string][] = [
    ["index", "Index"],
    ["researcher", "Researcher"],
    ["analyst", "Analyst"],
    ["writer", "Writer"],
    ["critic", "Critic"],
    ["rubric", "Rubric"],
  ];
  const links = items.map(([k, label]) => (k === current ? `**${label}**` : `[${label}](${FILES_EN[k]})`)).join(" · ");
  return `${links}  \n🌐 [Portuguese original](../${FILES[current]})`;
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

// ─── Traduções ───────────────────────────────────────────────────────────────

/** Blocos em português, na forma exata em que aparecem na página. */
const blocks: Record<string, string> = {};
const trStatus: { key: string; state: "ok" | "stale" | "missing" | "stamped"; sha: string }[] = [];

function blk(key: string, text: string): string {
  blocks[key] = text.trim();
  return block(text);
}

function readTr(key: string): { sha: string; text: string } | null {
  const file = path.join(TR_DIR, `${key}.txt`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^source-sha: (\S+)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`tradução malformada (esperado "source-sha: …" e "---"): ${file}`);
  return { sha: m[1], text: m[2].trim() };
}

function stampTr(key: string, sha: string, text: string) {
  fs.writeFileSync(path.join(TR_DIR, `${key}.txt`), `source-sha: ${sha}\n---\n${text}\n`, "utf8");
}

/** Resolve a tradução de um bloco já registrado. `source` é o texto usado no hash. */
function translate(key: string, source: string, originalLink: string): { note: string; text: string } {
  const current = sha16(source);
  const tr = readTr(key);
  if (!tr) {
    trStatus.push({ key, state: "missing", sha: current });
    return {
      note: `> **Translation missing** for this block. See the [Portuguese original](${originalLink}).\n\n`,
      text: "[translation missing]",
    };
  }
  if (tr.sha !== current) {
    if (STAMP) {
      stampTr(key, current, tr.text);
      trStatus.push({ key, state: "stamped", sha: current });
      return { note: "", text: tr.text };
    }
    trStatus.push({ key, state: "stale", sha: current });
    return {
      note: `> **Outdated translation:** the Portuguese original of this block changed after it was translated. See the [Portuguese original](${originalLink}).\n\n`,
      text: tr.text,
    };
  }
  trStatus.push({ key, state: "ok", sha: current });
  return { note: "", text: tr.text };
}

function tr(key: string, originalLink: string): string {
  if (!(key in blocks)) throw new Error(`bloco ${key} não foi registrado antes da tradução`);
  const t = translate(key, blocks[key], originalLink);
  return `${t.note}${block(t.text)}`;
}

interface RubricTranslation {
  scale: Record<string, string>;
  overall: string;
  dimensions: Record<string, { label: string; question: string; anchors: Record<string, string> }>;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const cfg = await getAgentConfig();
  const dates = await configDates();
  const today = new Date().toISOString().slice(0, 10);
  const hash = await currentRubricHash();
  const hashOk = hash === STUDY_RUBRIC_HASH;

  const ids = ["researcher", "analyst", "writer", "judge"] as const;
  type Id = (typeof ids)[number];
  const models = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await getAgentModelName(id)]))) as Record<Id, string>;
  const temps: Record<Id, number> = {
    researcher: getAgentTemperature("researcher"),
    analyst: getAgentTemperature("analyst"),
    writer: getAgentTemperature("writer"),
    judge: JUDGE_TEMPERATURE,
  };
  const mode: Record<Id, "replace" | "prepend"> = {
    researcher: "replace",
    analyst: "replace",
    writer: "prepend",
    judge: "prepend",
  };

  const hasOverride = (id: AgentId) => Boolean(cfg[id].promptOverride.trim());
  const replaced = (id: Id) => hasOverride(id) && mode[id] === "replace";
  const overrides = ids.filter((id) => hasOverride(id));

  for (const id of ids) {
    const d = dates.get(id);
    console.log(`${id.padEnd(10)} override=${hasOverride(id) ? "ATIVO" : "vazio"} config atualizada em ${d?.toISOString() ?? "?"}`);
  }
  if (!hashOk) console.warn(`ATENÇÃO: hash do Critic ${hash} ≠ hash do estudo ${STUDY_RUBRIC_HASH}.`);

  const configNote = (id: Id) => {
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

  const configNoteEn = (id: Id) => {
    const c = cfg[id];
    const d = dates.get(id);
    const ov = !hasOverride(id)
      ? "empty — the code prompt applies"
      : mode[id] === "replace"
        ? `**ACTIVE, and it replaces the code prompt.** The text below is the override; \`${PROMPT_FILES[id]}\` is not used`
        : "**ACTIVE** — placed before the code prompt";
    return [
      `- **Role** (\`agent_configs.role\`, added as a preamble): ${c.role.trim() ? `“${c.role.trim()}” (Portuguese; translated in the prompt below)` : "empty"}`,
      `- **Override** (\`agent_configs.promptOverride\`, mode \`${mode[id]}\`): ${ov}`,
      `- **Last configuration change:** ${d ? dateIso(d) : "not recorded"}`,
    ].join("\n");
  };

  const sourceRow = (id: Id, node: string) =>
    replaced(id)
      ? `texto do override em \`agent_configs\` (em vigor); nó em \`${node}\``
      : `\`${PROMPT_FILES[id]}\`, \`${node}\``;
  const sourceRowEn = (id: Id, node: string) =>
    replaced(id)
      ? `override text in \`agent_configs\` (in effect); node in \`${node}\``
      : `\`${PROMPT_FILES[id]}\`, \`${node}\``;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolShape = (searchTool.schema as any).shape as Record<string, { description?: string }>;
  const toolParams = Object.entries(toolShape)
    .map(([k, v]) => `| \`${k}\` | ${v.description ?? ""} |`)
    .join("\n");

  // ════════════════════════════════════════════════════════════════════════
  // Português
  // ════════════════════════════════════════════════════════════════════════

  // ── Researcher ────────────────────────────────────────────────────────────
  const researcherSystem = composeSystemPrompt(cfg.researcher.role, cfg.researcher.promptOverride, RESEARCHER_PROMPT);

  write(OUT, FILES.researcher, `# 01 · Researcher

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

${blk("researcher.system", researcherSystem)}

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
  const analystUser = `TÓPICO: ${P.topic}

FONTES:
[1] {{TÍTULO_DA_FONTE}}
URL: {{URL}}
{{PRIMEIROS_2000_CARACTERES_DO_CONTEÚDO}}

[2] ...`;

  write(OUT, FILES.analyst, `# 02 · Analyst

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

${blk("analyst.system", analystSystem)}

## Mensagem do usuário

Formato montado por \`formatPayloadForAnalyst\` (transcrito de \`analytic.node.ts\`):

${blk("analyst.user", analystUser)}

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
  const sizes = ["small", "medium", "large"] as const;
  const lengthBlocks = sizes
    .map((s) => {
      const r = POST_SIZE_RANGES[s];
      return `### ${r.label} (${r.min}–${r.max} caracteres)\n\n${blk(`writer.length.${s}`, extract(writerBase("", "", r), lengthRe, "<length_target>"))}`;
    })
    .join("\n\n");
  const writerUser = `1. {{INSIGHT_1}}
2. {{INSIGHT_2}}
3. {{INSIGHT_3}}`;

  write(OUT, FILES.writer, `# 03 · Writer

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

${blk("writer.system", writerSystem)}

## Mensagem do usuário

${blk("writer.user", writerUser)}

## Reescrita após reprovação do Critic

Quando o post volta do Critic, o nó acrescenta o rascunho anterior, as notas, os problemas e as sugestões dentro do bloco \`<insights>\`. O restante do prompt é igual ao da primeira versão. O bloco é montado em \`writer.node.ts\` e está transcrito abaixo com placeholders:

${blk("writer.retry", retryInsights)}

## Revisão pedida pelo humano

Quando o revisor pede mudanças, o comentário dele entra num bloco de prioridade absoluta no topo do prompt, logo depois do bloco de idioma, e o rascunho anterior entra em \`<insights>\`:

${blk("writer.human.header", humanHeader)}

${blk("writer.human.insights", humanInsights)}

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

  write(OUT, FILES.critic, `# 04 · Critic

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

${blk("critic.system", judgeSystem)}

## Mensagem do usuário

${block(P.post)}

## Retentativa de coerência

Depois da resposta, o código confere se alguma nota é maior que a pior âncora que o próprio Critic citou para aquela dimensão. Se for, o prompt é reenviado uma vez com o bloco abaixo no final (transcrito de \`judge.node.ts\`). Se a contradição continuar, a nota é rebaixada para a âncora citada e o caso fica registrado.

${blk("critic.correction", correction)}

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

  write(OUT, FILES.rubric, `# 05 · Rubrica e regra de aceitação

${nav("rubric")}

A rubrica é o instrumento comum ao Critic e aos avaliadores humanos. O texto abaixo é o original em português, gerado de \`src/app/MAS/lib/rubric.ts\` — o mesmo arquivo que alimenta o prompt do Critic. A tradução para o inglês está em [en/${FILES_EN.rubric}](en/${FILES_EN.rubric}) e no apêndice do artigo.

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

  // ── Versões (usadas nos dois índices) ─────────────────────────────────────
  // Config em arquivo anterior à migração para o banco (gitignorada; existe só
  // na máquina de quem gerou o corpus). Quando está presente, é a evidência de
  // que o override já valia ANTES dos posts do estudo.
  const legacyPath = path.join(process.cwd(), "data", "agent-config.json");
  const legacy = fs.existsSync(legacyPath)
    ? { cfg: JSON.parse(fs.readFileSync(legacyPath, "utf8")) as Record<string, { promptOverride?: string }>, mtime: fs.statSync(legacyPath).mtime }
    : null;

  type OverrideTiming = "none" | "unknown" | "before" | "same-as-legacy" | "after";
  const overrideTiming = (id: "researcher" | "analyst"): OverrideTiming => {
    if (!replaced(id)) return "none";
    const d = dates.get(id);
    if (!d) return "unknown";
    if (d < CORPUS_START) return "before";
    if (legacy && (legacy.cfg[id]?.promptOverride ?? "") === cfg[id].promptOverride) return "same-as-legacy";
    return "after";
  };

  const versionLine = (id: "researcher" | "analyst", label: string) => {
    const t = overrideTiming(id);
    if (t === "none") return "";
    const d = dates.get(id);
    const when = {
      unknown: "sem data de alteração registrada",
      before: `última alteração em ${d ? dateBr(d) : "?"}, antes da geração dos posts do estudo — portanto foi este o texto usado neles`,
      "same-as-legacy": `a última gravação da configuração, em ${d ? utc(d) : "?"} UTC, ocorreu durante a geração dos posts, mas o texto é idêntico ao da configuração em arquivo de ${legacy ? dateBr(legacy.mtime) : "?"}, anterior aos posts — portanto foi este o texto usado neles`,
      after: `última alteração em ${d ? dateBr(d) : "?"}, depois do início da geração dos posts do estudo — o texto usado neles pode ter sido outro`,
    }[t];
    return `- **${label}.** O prompt em vigor é o override gravado na configuração (${when}). O texto de \`${PROMPT_FILES[id]}\` não é usado enquanto o override existir.`;
  };
  const versionLineEn = (id: "researcher" | "analyst", label: string) => {
    const t = overrideTiming(id);
    if (t === "none") return "";
    const d = dates.get(id);
    const when = {
      unknown: "no change date recorded",
      before: `last changed on ${d ? dateIso(d) : "?"}, before the study posts were generated — so this is the text used for them`,
      "same-as-legacy": `the configuration was last saved on ${d ? utc(d) : "?"} UTC, while the posts were being generated, but the text is identical to the file-based configuration of ${legacy ? dateIso(legacy.mtime) : "?"}, which predates the posts — so this is the text used for them`,
      after: `last changed on ${d ? dateIso(d) : "?"}, after the generation of the study posts started — the text used for them may have been different`,
    }[t];
    return `- **${label}.** The prompt in effect is the override stored in the configuration (${when}). The text in \`${PROMPT_FILES[id]}\` is not used while the override exists.`;
  };

  const writerMtime = fs.statSync(path.join(process.cwd(), PROMPT_FILES.writer)).mtime;
  const writerAfter = writerMtime > CORPUS_END;
  const writerLine = writerAfter
    ? `- **Writer.** O prompt é o do código, cuja última modificação é de ${dateBr(writerMtime)}, depois da geração dos posts do estudo (29/08 a 02/09/2026). A mudança principal foi o bloco de idioma de saída, para permitir posts em inglês; a versão exata usada nos posts não está versionada.`
    : `- **Writer.** O prompt é o do código, sem modificação desde ${dateBr(writerMtime)}, antes do fim da geração dos posts do estudo.`;
  const writerLineEn = writerAfter
    ? `- **Writer.** The prompt is the code prompt, last modified on ${dateIso(writerMtime)}, after the study posts were generated (2026-08-29 to 2026-09-02). The main change was the output-language block, added to allow posts in English; the exact version used for the posts is not under version control.`
    : `- **Writer.** The prompt is the code prompt, unchanged since ${dateIso(writerMtime)}, before the generation of the study posts ended.`;

  // A evidência por post vem dos checkpoints do LangGraph (model_name das
  // respostas), conferida em 2026-09-13; não é recalculada aqui.
  const writerCfgDate = dates.get("writer");
  const writerModelChanged = Boolean(writerCfgDate && writerCfgDate >= CORPUS_START && writerCfgDate < CORPUS_END);
  const writerModelLine = writerModelChanged
    ? `- **Modelo do Writer.** A configuração atual (\`${models.writer}\`) foi gravada em ${utc(writerCfgDate!)} UTC, durante a geração dos posts do estudo. Pelos registros de execução, sete posts foram escritos por \`gpt-4o-2024-08-06\` e três (J, L e P) por \`gpt-4o-mini-2024-07-18\`. Researcher e Analyst usaram \`gpt-4o-2024-08-06\` e o Critic, \`gpt-4.1-2025-04-14\`.`
    : "";
  const writerModelLineEn = writerModelChanged
    ? `- **Writer model.** The current configuration (\`${models.writer}\`) was saved on ${utc(writerCfgDate!)} UTC, while the study posts were being generated. According to the execution records, seven posts were written by \`gpt-4o-2024-08-06\` and three (J, L and P) by \`gpt-4o-mini-2024-07-18\`. The Researcher and Analyst used \`gpt-4o-2024-08-06\`, and the Critic used \`gpt-4.1-2025-04-14\`.`
    : "";

  // ── Índice ────────────────────────────────────────────────────────────────
  const row = (n: string, file: string, agent: string, fn: string, model: string, temp: number) =>
    `| ${n} | [${agent}](${file}) | ${fn} | \`${model}\` | ${temp} |`;

  write(OUT, FILES.index, `# Prompts dos agentes

Esta pasta reúne, na íntegra, os prompts usados pelos agentes do Solera e a rubrica de avaliação. É a referência citada no artigo.

> Gerado automaticamente em ${today} por \`pnpm prompts:export\`, a partir do código e da configuração dos agentes. Não edite à mão: altere a origem e gere de novo.

🌐 **English translation:** [en/README.md](en/README.md)

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

- **Idioma.** Os prompts estão em português do Brasil, o idioma em que rodaram no estudo. A [tradução para o inglês](en/README.md) acompanha a mesma estrutura.
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

  // ════════════════════════════════════════════════════════════════════════
  // English
  // ════════════════════════════════════════════════════════════════════════

  const orig = (k: keyof typeof FILES, anchor = "") => `../${FILES[k]}${anchor}`;

  write(OUT_EN, FILES_EN.researcher, `# 01 · Researcher

${navEn("researcher")}

The Researcher receives the requested topic and decides which web searches to run. It does not write anything for the user: what the pipeline uses are the search results, which are passed on to the Analyst.

## Summary

| | |
|---|---|
| Purpose | Gather relevant and recent sources on the topic |
| Model | \`${models.researcher}\` |
| Temperature | ${temps.researcher} |
| Tool | \`${searchTool.name}\` |
| Input | user message with the topic |
| Output | the word \`OK\` — the pipeline reads the tool results, not the reply |
| Prompt source | ${sourceRowEn("researcher", "src/app/MAS/nodes/researcher.node.ts")} |

## How the prompt is assembled

${configNoteEn("researcher")}

## System prompt

${tr("researcher.system", orig("researcher", "#prompt-de-sistema"))}

## User message

${block("{{TOPIC}}")}

## Search tool

The tool description and parameters are written in English in the original.

${block(searchTool.description)}

| Parameter | Description |
|---|---|
${toolParams}

The results of all calls are deduplicated and ranked by relevance before reaching the Analyst.

---

${navEn("researcher")}
`);

  write(OUT_EN, FILES_EN.analyst, `# 02 · Analyst

${navEn("analyst")}

The Analyst reads the collected sources, discards irrelevant or commercial ones and extracts 3 to 5 insights on the topic. This is the material the Writer works from.

## Summary

| | |
|---|---|
| Purpose | Filter sources and extract insights |
| Model | \`${models.analyst}\` |
| Temperature | ${temps.analyst} |
| Input | user message with the topic and the sources (up to 2,000 characters each) |
| Output | JSON \`{ filtered, discarded, insights }\` |
| Abort | with fewer than 2 relevant sources, the run stops |
| Prompt source | ${sourceRowEn("analyst", "src/app/MAS/nodes/analytic.node.ts")} |

## How the prompt is assembled

${configNoteEn("analyst")}
${replaced("analyst") ? "- **Language:** the override is a fixed Portuguese text; the language block from the code (`src/app/MAS/lib/language.ts`) is not applied." : `- **Language:** rendered for \`${LANG}\`, the language of the study. For \`en-US\` only the language block changes.`}

## System prompt

${tr("analyst.system", orig("analyst", "#prompt-de-sistema"))}

## User message

Format built by \`formatPayloadForAnalyst\` (transcribed from \`analytic.node.ts\`; the labels are in Portuguese in the original):

${tr("analyst.user", orig("analyst", "#mensagem-do-usuário"))}

---

${navEn("analyst")}
`);

  const sizeLabelEn: Record<(typeof sizes)[number], string> = { small: "Small", medium: "Medium", large: "Large" };
  const lengthBlocksEn = sizes
    .map((s) => {
      const r = POST_SIZE_RANGES[s];
      return `### ${sizeLabelEn[s]} (${r.min}–${r.max} characters)\n\n${tr(`writer.length.${s}`, orig("writer", "#faixas-de-tamanho"))}`;
    })
    .join("\n\n");

  write(OUT_EN, FILES_EN.writer, `# 03 · Writer

${navEn("writer")}

The Writer turns the insights into a LinkedIn post. It writes the first version and also the rewrites — when the Critic rejects the text or when the human reviewer asks for changes. The prompt deliberately does not repeat the Critic's rubric, so that the evaluator and the writer remain independent.

## Summary

| | |
|---|---|
| Purpose | Write and rewrite the post |
| Model | \`${models.writer}\` |
| Temperature | ${temps.writer} |
| Input | system prompt with topic and insights; the list of insights is also sent as the user message |
| Output | only the text of the post |
| Automatic rewrites | up to ${MAX_JUDGE_RETRIES} after Critic rejections |
| Human revisions | up to ${MAX_REVISIONS} |
| Prompt source | ${sourceRowEn("writer", "src/app/MAS/nodes/writer.node.ts")} |

## How the prompt is assembled

${configNoteEn("writer")}
- **Language:** rendered for \`${LANG}\`. For \`en-US\` the language block changes and the lists of banned constructions gain an English version.
- **Length:** rendered for the Medium size (${medium.min}–${medium.max} characters). The variations are in [Length ranges](#length-ranges).

## System prompt

First version of the post, without feedback:

${tr("writer.system", orig("writer", "#prompt-de-sistema"))}

## User message

${tr("writer.user", orig("writer", "#mensagem-do-usuário"))}

## Rewrite after Critic rejection

When the post comes back from the Critic, the node appends the previous draft, the scores, the problems and the suggestions inside the \`<insights>\` block. The rest of the prompt is the same as for the first version. The block is built in \`writer.node.ts\` and transcribed below with placeholders:

${tr("writer.retry", orig("writer", "#reescrita-após-reprovação-do-critic"))}

## Human revision request

When the reviewer asks for changes, the comment is placed in an absolute-priority block at the top of the prompt, right after the language block, and the previous draft goes into \`<insights>\`:

${tr("writer.human.header", orig("writer", "#revisão-pedida-pelo-humano"))}

${tr("writer.human.insights", orig("writer", "#revisão-pedida-pelo-humano"))}

## Length ranges

The only block that changes with the requested size:

${lengthBlocksEn}

---

${navEn("writer")}
`);

  write(OUT_EN, FILES_EN.critic, `# 04 · Critic

${navEn("critic")}

The Critic (called *Judge* in the code and in the interface) scores each post with the four-dimension rubric and gives an overall score. It does not decide whether the post is accepted and does not rewrite anything: the decision comes from a rule computed in code from the scores, and its criticism is sent back to the Writer.

${hashOk ? "The Portuguese original of this prompt is exactly the prompt that produced the Critic scores analysed in the paper (see the [instrument hash](#how-the-prompt-is-assembled))." : "**Warning:** the hash of this prompt is not the one of the scores analysed in the paper."}

## Summary

| | |
|---|---|
| Purpose | Score the post and explain the problems found |
| Model | \`${models.judge}\` (different from the Writer's, to reduce self-preference bias) |
| Temperature | ${temps.judge} |
| Input | topic and post in the system prompt; the post is also sent as the user message |
| Output | JSON with \`issues\`, \`suggestions\`, \`hasEngagementBait\`, the four scores and \`overall\`, in this order |
| Decision | computed in code — see [Rubric and acceptance rule](${FILES_EN.rubric}) |
| Instrument hash | \`${hash}\` ${hashOk ? "— **identical** to the one stored with the study scores" : `— **DIFFERENT** from the study (\`${STUDY_RUBRIC_HASH}\`)`} |
| Prompt source | ${sourceRowEn("judge", "src/app/MAS/nodes/judge.node.ts")}, \`src/app/MAS/lib/rubric.ts\` |

## How the prompt is assembled

${configNoteEn("judge")}
- **Length:** rendered for the medium size, the one used to score the study corpus. Length only appears as context for the diagnosis; it does not change the scores.
- **Hash:** SHA-256 of role + override + template (with fixed topic and post), truncated to 16 characters, computed over the Portuguese original. It is stored with every score in the database, which makes it possible to tell which prompt version produced each assessment.

## System prompt

The example posts and the JSON string values were written in Portuguese in the original and are translated here; JSON keys are unchanged.

${tr("critic.system", orig("critic", "#prompt-de-sistema"))}

## User message

${block("{{POST}}")}

## Coherence retry

After the response, the code checks whether any score is higher than the worst anchor the Critic itself cited for that dimension. If so, the prompt is sent once more with the block below appended (transcribed from \`judge.node.ts\`). If the contradiction persists, the score is lowered to the cited anchor and the case is recorded.

${tr("critic.correction", orig("critic", "#retentativa-de-coerência"))}

## What the code does with the response

1. Parses the JSON (retrying once if it is malformed).
2. Checks the coherence between scores and anchors, as described above.
3. Computes the ACCEPT/REJECT decision with the [acceptance rule](${FILES_EN.rubric}#acceptance-rule).
4. Computes the format checks itself (length, link in the body); \`hasEngagementBait\` is the only one that comes from the model.

---

${navEn("critic")}
`);

  // Rubrica em inglês: a tradução é um JSON, conferida contra o instrumento inteiro.
  const rubricSource = JSON.stringify({ d: RUBRIC_DIMENSIONS, s: SCALE_LABELS, o: OVERALL_QUESTION });
  const rubricTr = translate("rubric", rubricSource, orig("rubric"));
  let rubricEnBody: string;
  if (rubricTr.text === "[translation missing]") {
    rubricEnBody = rubricTr.note;
  } else {
    const r = JSON.parse(rubricTr.text) as RubricTranslation;
    const scaleRows = ([1, 2, 3, 4, 5] as const).map((n) => `| ${n} | ${r.scale[n]} |`).join("\n");
    const dims = RUBRIC_DIMENSIONS.map((d) => {
      const t = r.dimensions[d.key];
      if (!t) throw new Error(`rubric.txt sem a dimensão ${d.key}`);
      const rows = ([1, 2, 3, 4, 5] as const).map((n) => `| ${n} · ${r.scale[n]} | ${t.anchors[n]} |`).join("\n");
      return `### ${t.label} (\`${d.key}\`)\n\n**Question:** ${t.question}\n\n**Weight in the composite:** ${DIMENSION_WEIGHTS[d.key]}\n\n| Point | Anchor |\n|---|---|\n${rows}`;
    }).join("\n\n");
    const composite = RUBRIC_DIMENSIONS.map((d) => `${DIMENSION_WEIGHTS[d.key]} × ${r.dimensions[d.key].label.toLowerCase()}`).join(" + ");
    rubricEnBody = `${rubricTr.note}## Scale

| Point | Label |
|---|---|
${scaleRows}

## Dimensions

${dims}

### Overall quality (\`overall\`)

**Question:** ${r.overall}

No per-point anchors. It is asked last and is not part of the acceptance rule.

## Acceptance rule

The decision is computed in code rather than requested from the model. A post is **accepted** when both conditions hold:

1. **Composite ≥ ${ACCEPT_COMPOSITE_MIN}**, the composite being the weighted mean
   ${composite}.
2. **No floor violation:** the post is rejected if two dimensions fall below ${ACCEPT_MIN} and at least one of them is clarity or relevance.

Length outside the range, an external link in the body and an artificial request for engagement do not change the scores. They are separate conformance checks, which also send the draft back to the Writer.`;
  }

  write(OUT_EN, FILES_EN.rubric, `# 05 · Rubric and acceptance rule

${navEn("rubric")}

The rubric is the instrument shared by the Critic and the human raters. This is a translation of the Portuguese original, which is generated from \`src/app/MAS/lib/rubric.ts\` — the same file that feeds the Critic prompt. The wording matches the rubric table in the paper's appendix.

Rubric version: \`${RUBRIC_VERSION}\`.

${rubricEnBody}

---

${navEn("rubric")}
`);

  const rowEn = (n: string, file: string, agent: string, fn: string, model: string, temp: number) =>
    `| ${n} | [${agent}](${file}) | ${fn} | \`${model}\` | ${temp} |`;

  write(OUT_EN, FILES_EN.index, `# Agent prompts — English translation

This folder is an English translation of the [agent prompts](../README.md) of Solera and of the evaluation rubric. It accompanies the paper, which cites these prompts.

> **The Portuguese originals are the authoritative version:** they are the text the agents actually received. This translation is provided for readers who do not read Portuguese. Generated on ${today} by \`pnpm prompts:export\`.

## Index

| # | Agent | What it does | Model (current configuration) | Temperature |
|---|---|---|---|---|
${rowEn("01", FILES_EN.researcher, "Researcher", "Searches for sources on the topic", models.researcher, temps.researcher)}
${rowEn("02", FILES_EN.analyst, "Analyst", "Filters the sources and extracts insights", models.analyst, temps.analyst)}
${rowEn("03", FILES_EN.writer, "Writer", "Writes and rewrites the post", models.writer, temps.writer)}
${rowEn("04", FILES_EN.critic, "Critic", "Scores the post with the rubric", models.judge, temps.judge)}
| 05 | [Rubric and acceptance rule](${FILES_EN.rubric}) | Instrument shared by the Critic and human raters | — | — |

### Shortcuts

- Researcher: [system prompt](${FILES_EN.researcher}#system-prompt) · [search tool](${FILES_EN.researcher}#search-tool)
- Analyst: [system prompt](${FILES_EN.analyst}#system-prompt) · [user message](${FILES_EN.analyst}#user-message)
- Writer: [system prompt](${FILES_EN.writer}#system-prompt) · [rewrite after Critic rejection](${FILES_EN.writer}#rewrite-after-critic-rejection) · [human revision](${FILES_EN.writer}#human-revision-request) · [length ranges](${FILES_EN.writer}#length-ranges)
- Critic: [system prompt](${FILES_EN.critic}#system-prompt) · [coherence retry](${FILES_EN.critic}#coherence-retry)
- Rubric: [dimensions](${FILES_EN.rubric}#dimensions) · [acceptance rule](${FILES_EN.rubric}#acceptance-rule)

## Translation conventions

- **Structure tags.** Tag and attribute names (\`<insights>\`, \`<anti_padrao>\`, \`priority\`, …) are kept exactly as in the original, some of them in Portuguese; attribute values and the text inside the tags are translated.
- **Quoted Portuguese.** Phrases that the prompts quote as examples to avoid or imitate (for instance, banned connectives such as “Além disso”) are kept in Portuguese and followed by an English gloss in brackets, because the model was instructed about those exact strings.
- **Placeholders.** Values filled in at run time are shown as English placeholders, such as \`{{TOPIC}}\`, \`{{INSIGHTS}}\` and \`{{POST}}\`.
- **Staleness check.** Each translated block records a hash of the Portuguese block it translates. If the original changes and the translation is not revised, the page shows a warning next to the block.

## How to read these prompts

- **Assembly.** Each system prompt starts with the agent's role (\`PAPEL DESTE AGENTE: …\`, “AGENT ROLE” in the translation). It is followed by the code prompt or, if set, by the override configured in the interface, which replaces the code prompt (Researcher, Analyst) or is placed before it (Writer, Critic). ${overrides.length ? `When this folder was generated, an override was active for: **${overrides.join(", ")}**.` : "When this folder was generated, no override was active."}
- **Rendered vs. transcribed.** System prompts are rendered by the same functions the pipeline uses. The blocks that the nodes build at run time (the Writer's rewrite block, the human reviewer's request, the Critic's coherence correction) are transcribed from the code and marked as such.

## Agents without a prompt

- **Human review (HITL).** Pauses the run and shows the post and the scores to the reviewer, who can approve it, request a revision with a comment or cancel. The comment becomes the Writer's [human revision](${FILES_EN.writer}#human-revision-request) block.
- **Publisher.** Publishes the approved post on LinkedIn and records the publication.

## Versions and relationship to the study

- **Critic.** The hash of the prompt generated here is \`${hash}\`, ${hashOk ? "identical to the one stored with the Critic scores analysed in the paper. The prompt in this folder is exactly the one that produced those scores" : `**different** from the one stored with the study scores (\`${STUDY_RUBRIC_HASH}\`). The prompt in this folder is not the one that produced those scores`}.
${versionLineEn("researcher", "Researcher")}
${versionLineEn("analyst", "Analyst")}
${writerLineEn}
${writerModelLineEn}
`);

  // ── Resumo das traduções ─────────────────────────────────────────────────
  const bad = trStatus.filter((t) => t.state === "missing" || t.state === "stale");
  const stamped = trStatus.filter((t) => t.state === "stamped");
  console.log(`\nprompts/ gerado · hash do Critic ${hash} ${hashOk ? "= estudo" : "≠ estudo"}`);
  console.log(`traduções: ${trStatus.length - bad.length} em dia${stamped.length ? ` (${stamped.length} carimbadas agora)` : ""}, ${bad.length} com problema`);
  for (const t of bad) console.warn(`  ${t.state.padEnd(8)} ${t.key}  (hash do original: ${t.sha})`);
}

function write(dir: string, file: string, content: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content.replace(/\n{3,}/g, "\n\n"), "utf8");
  console.log(`→ ${path.relative(process.cwd(), path.join(dir, file)).replace(/\\/g, "/")}`);
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
