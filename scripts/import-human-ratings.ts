import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { draftVersions, humanRatings } from "@/db/schema";
import { RUBRIC_DIMENSIONS, RUBRIC_VERSION } from "@/app/MAS/lib/rubric";
import { closeDb } from "./closeDb";

// Carrega as notas humanas do formulário na tabela `human_ratings`.
//
//   pnpm study:import-humans [--dry-run] [--file <csv>]
//
// A ENTRADA NÃO É O CSV DO GOOGLE FORMS. É o `human_ratings_long.csv` que
// `study/analysis/gate_study.py` escreve em `study/analysis/out/` — 1 linha por
// (avaliador × post), com `versionId` já resolvido e o e-mail já trocado por um
// pseudônimo. Duas razões, as duas de método:
//
//   1. UM parser do formulário, não dois. O CSV do Forms tem título de pergunta
//      como nome de coluna, opção inteira como valor e um código `[A1]` a
//      separar post de dimensão. Um segundo parser em TypeScript divergiria do
//      Python no primeiro ajuste, e a divergência apareceria como DADO ERRADO no
//      banco, não como erro de compilação.
//   2. O e-mail do avaliador não entra no banco. A pseudonimização acontece na
//      análise e o mapa fica só em `out/avaliadores_identidade.csv`.
//
// Reexecutar é seguro: a chave é (raterId, draftVersionId) e a linha existente é
// ATUALIZADA. Um avaliador que responde de novo corrige a resposta dele em vez
// de virar uma segunda linha — que é o que o índice único já impõe.

interface Linha {
  raterId: string;
  draftVersionId: string;
  postLabel: string;
  clarity: number | null;
  relevance: number | null;
  professional: number | null;
  engagement: number | null;
  overall: number | null;
  rubricVersion: string;
  origem: string;
  submittedAt: string;
}

/** CSV com aspas — o mesmo formato que o pandas escreve. */
function parseCSV(txt: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo.length || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  if (!linhas.length) return [];
  const head = linhas[0].map((h) => h.replace(/^﻿/, "").trim());
  return linhas
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const DIMS = RUBRIC_DIMENSIONS.map((d) => d.key);
const PADRAO = path.join(
  process.cwd(),
  "study",
  "analysis",
  "out",
  "human_ratings_long.csv",
);

function nota(v: string, campo: string, linha: number): number | null {
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error(`linha ${linha}: ${campo}="${v}" fora da escala 1–5`);
  }
  return n;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const arquivo = argv.includes("--file")
    ? argv[argv.indexOf("--file") + 1]
    : PADRAO;

  let txt: string;
  try {
    txt = readFileSync(arquivo, "utf8");
  } catch {
    console.error(
      `não achei ${arquivo}\n` +
        "Ele é gerado pela análise:  cd study/analysis && python gate_study.py\n" +
        "Ou aponte outro com --file <caminho>.",
    );
    process.exit(1);
  }

  const linhas: Linha[] = [];
  parseCSV(txt).forEach((r, i) => {
    const n = i + 2;
    if (!r.raterId || !r.draftVersionId) {
      throw new Error(`linha ${n}: falta raterId ou draftVersionId`);
    }
    linhas.push({
      raterId: r.raterId,
      draftVersionId: r.draftVersionId,
      postLabel: r.postLabel || "",
      clarity: nota(r.clarity, "clarity", n),
      relevance: nota(r.relevance, "relevance", n),
      professional: nota(r.professional, "professional", n),
      engagement: nota(r.engagement, "engagement", n),
      overall: nota(r.overall, "overall", n),
      // O default é a versão do instrumento em código, não uma string solta: a
      // resposta pertence a um instrumento, e é o que separa as coletas.
      rubricVersion: r.rubricVersion || RUBRIC_VERSION,
      // Ausente = arquivo de antes desta coluna existir. Tratado como real,
      // porque o único gerador de SIMULADO é posterior a ela.
      origem: r.origem || "FORMULARIO",
      submittedAt: r.submittedAt || "",
    });
  });

  if (!linhas.length) {
    console.error("nenhuma linha no arquivo.");
    process.exit(1);
  }

  // Dado fictício com versionId REAL passaria por todas as outras guardas: o
  // simulador roda sobre o corpus de verdade, então as chaves existem. Esta é a
  // única barreira, e por isso não tem flag para desligar.
  const simuladas = linhas.filter((l) => l.origem !== "FORMULARIO");
  if (simuladas.length) {
    console.error(
      `${simuladas.length} linhas com origem "${simuladas[0].origem}".`,
    );
    console.error(
      "Este arquivo veio de study/analysis/simular_humanos.py — são avaliadores",
    );
    console.error("FICTÍCIOS sobre o corpus real. Não entram na tabela do estudo.");
    console.error("Nada foi gravado.");
    process.exit(1);
  }

  const porAvaliador = new Map<string, number>();
  const porPost = new Map<string, number>();
  let incompletas = 0;
  for (const l of linhas) {
    porAvaliador.set(l.raterId, (porAvaliador.get(l.raterId) ?? 0) + 1);
    porPost.set(l.postLabel, (porPost.get(l.postLabel) ?? 0) + 1);
    if (DIMS.some((d) => l[d] === null) || l.overall === null) incompletas++;
  }

  console.log(`arquivo: ${arquivo}`);
  console.log(
    `  ${linhas.length} avaliações · ${porAvaliador.size} avaliadores · ` +
      `${porPost.size} posts · rubrica ${linhas[0].rubricVersion}`,
  );
  if (incompletas) {
    console.log(
      `  ${incompletas} com alguma dimensão em branco — gravadas assim; ` +
        "a análise é que decide o que fazer com item incompleto",
    );
  }
  for (const [r, n] of [...porAvaliador].sort()) console.log(`    ${r}: ${n} posts`);

  // A junção é por `versionId`, e uma versão que não existe no banco significa
  // corpus reexportado depois do formulário — a letra passou a apontar para
  // outro post. Abortar inteiro: importar metade deixaria o dataset num estado
  // que ninguém consegue distinguir de um estado bom.
  const db = getDb();
  const ids = [...new Set(linhas.map((l) => l.draftVersionId))];
  const existentes = new Set(
    (
      await db
        .select({ id: draftVersions.id })
        .from(draftVersions)
        .where(inArray(draftVersions.id, ids))
    ).map((r) => r.id),
  );
  const orfas = ids.filter((id) => !existentes.has(id));
  if (orfas.length) {
    console.error(
      `${orfas.length} versionId do arquivo não existem em draft_versions:\n  ` +
        orfas.slice(0, 5).join("\n  ") +
        (orfas.length > 5 ? `\n  … e mais ${orfas.length - 5}` : "") +
        "\nO corpus foi reexportado depois de o formulário ir a campo? Nada foi gravado.",
    );
    await closeDb();
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n--dry-run: nada foi gravado.");
    await closeDb();
    process.exit(0);
  }

  let gravadas = 0;
  for (const l of linhas) {
    const valores = {
      draftVersionId: l.draftVersionId,
      raterId: l.raterId,
      postLabel: l.postLabel || null,
      clarity: l.clarity,
      relevance: l.relevance,
      professional: l.professional,
      engagement: l.engagement,
      overall: l.overall,
      rubricVersion: l.rubricVersion,
      submittedAt: l.submittedAt ? new Date(l.submittedAt) : new Date(),
    };
    await db
      .insert(humanRatings)
      .values({ id: randomUUID(), ...valores })
      .onConflictDoUpdate({
        target: [humanRatings.raterId, humanRatings.draftVersionId],
        set: valores,
      });
    gravadas++;
  }

  const total = await db
    .select({ id: humanRatings.id })
    .from(humanRatings)
    .where(eq(humanRatings.rubricVersion, linhas[0].rubricVersion));
  console.log(
    `\n${gravadas} linhas gravadas. ` +
      `human_ratings tem ${total.length} avaliações na rubrica ${linhas[0].rubricVersion}.`,
  );
  await closeDb();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("FALHOU:", e.message);
  await closeDb();
  process.exit(1);
});
