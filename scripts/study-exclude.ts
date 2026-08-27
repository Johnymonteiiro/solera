import { listRunMeta, setRunExcluded } from "../src/app/MAS/lib/studyRecorder";

// Descarta (ou reverte o descarte de) uma execução do estudo.
//
//   pnpm study:exclude <threadId> "motivo"
//   pnpm study:exclude <threadId> --undo
//   pnpm study:exclude --list
//
// NÃO apaga nada: a execução continua no banco, com drafts e notas, e aparece
// nos exports com `excludedAt`/`excludedReason` preenchidos. É o registro de uma
// decisão do pesquisador, e por isso precisa viajar com o dataset em vez de
// virar uma linha some-do-nada. Para remover de verdade existe o DELETE em
// /api/mas/threads/[threadId], que cascateia e é irreversível.

async function main() {
  const [alvo, ...resto] = process.argv.slice(2);

  if (!alvo || alvo === "--list") {
    const runs = await listRunMeta();
    for (const r of runs) {
      const marca = r.excludedAt ? "DESCARTADA" : "          ";
      console.log(
        `${marca} ${r.threadId}  ${r.createdAt.slice(0, 16).replace("T", " ")}  ` +
          `${r.topic.replace(/\s+/g, " ").slice(0, 46)}` +
          `${r.excludedReason ? `\n             motivo: ${r.excludedReason}` : ""}`,
      );
    }
    process.exit(0);
  }

  const undo = resto[0] === "--undo";
  const motivo = undo ? null : resto.join(" ").trim();
  if (!undo && !motivo) {
    console.error('uso: study:exclude <threadId> "motivo"  |  <threadId> --undo  |  --list');
    console.error("o motivo é obrigatório: sem ele o descarte vira dado sem procedência.");
    process.exit(1);
  }

  const ok = await setRunExcluded(alvo, motivo);
  if (!ok) {
    console.error(`execução não encontrada: ${alvo}`);
    process.exit(1);
  }
  console.log(undo ? `${alvo}: descarte revertido` : `${alvo}: descartada — ${motivo}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
