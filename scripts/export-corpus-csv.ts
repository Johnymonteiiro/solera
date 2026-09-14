import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CORPUS_ITEM_COLUMNS,
  CORPUS_MAPPING_COLUMNS,
  SheetColumnSpec,
  corpusItemRow,
  corpusMappingRow,
} from "@/app/MAS/lib/corpusCsv";
import { getCorpusSelection } from "@/app/MAS/lib/studyCorpus";
import { closeDb } from "./closeDb";
import { ownerFromEnv } from "./owner";

// Escreve o corpus em study/data/, direto do banco.
//
//   pnpm study:corpus-csv [--out <pasta>]
//
// Mesmo conteúdo de GET /api/mas/export/corpus?format=csv|mapping|posts — as
// colunas vêm do módulo compartilhado, não de uma segunda cópia da lista. A
// razão de existir é não precisar do dev server rodando e de uma sessão aberta
// só para baixar três arquivos, e poder repetir a extração num comando quando o
// corpus mudar.
//
// OS TRÊS SAEM NA MESMA CHAMADA, de propósito: `corpus.csv` e
// `mapping-corpus.csv` precisam descrever o mesmo estado da fila. Baixados em
// momentos diferentes, uma execução nova entre os dois move letras e as
// respostas passam a apontar para o post errado sem nenhum erro aparecer.

/** CSV RFC 4180: aspas quando tem vírgula, aspas ou quebra de linha. */
function csv(columns: SheetColumnSpec[], rows: Record<string, unknown>[]): string {
  const escapar = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = [columns.map((c) => escapar(c.header)).join(",")];
  for (const r of rows) linhas.push(columns.map((c) => escapar(r[c.key])).join(","));
  return linhas.join("\n") + "\n";
}

async function main() {
  const argv = process.argv.slice(2);
  const destino = argv.includes("--out")
    ? argv[argv.indexOf("--out") + 1]
    : path.join(process.cwd(), "study", "data");

  const { items, stats } = await getCorpusSelection(ownerFromEnv());
  const corpus = items.filter((i) => i.inCorpus);
  if (!corpus.length) {
    console.error(
      "corpus vazio — nenhuma execução elegível.\n" +
        `candidatos: ${stats.candidatos}, execuções: ${stats.runs}\n` +
        "Excluídos: " +
        Object.entries(stats.excluded)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k}=${n}`)
          .join(", "),
    );
    await closeDb();
    process.exit(1);
  }

  mkdirSync(destino, { recursive: true });
  const escrever = (nome: string, conteudo: string) => {
    const p = path.join(destino, nome);
    writeFileSync(p, conteudo, "utf8");
    console.log(`  ${p}`);
  };

  escrever("corpus.csv", csv(CORPUS_ITEM_COLUMNS, items.map(corpusItemRow)));
  escrever(
    "mapping-corpus.csv",
    csv(CORPUS_MAPPING_COLUMNS, corpus.map(corpusMappingRow)),
  );

  console.log(
    `\n${stats.corpus} posts no corpus · ${stats.topicos} tópicos · ` +
      `ACCEPT ${stats.accept} / REJECT ${stats.reject} · balance ${stats.balance ?? "—"}`,
  );
  if (stats.balanceWarning) {
    console.log(
      "  ! desequilíbrio: a matriz de confusão vai degenerar (κ instável).\n" +
        "    Ver study/COLETA.md §2 — é limitação conhecida, não erro do export.",
    );
  }
  const fora = Object.entries(stats.excluded).filter(([, n]) => n > 0);
  if (fora.length) {
    console.log("  fora: " + fora.map(([k, n]) => `${k}=${n}`).join(", "));
  }
  await closeDb();
  process.exit(0);
}

main().catch(async (e) => {
  console.error("FALHOU:", e.message);
  await closeDb();
  process.exit(1);
});
