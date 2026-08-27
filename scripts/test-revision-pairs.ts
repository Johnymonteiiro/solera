import { getRevisionSelection } from "../src/app/MAS/lib/revisionPairs";
import { countVersions, getRevisionPairs } from "../src/app/MAS/lib/studyRecorder";

// Confere a seleção de pares antes/depois contra o banco real.
//   pnpm test:pairs

async function main() {
  const { pairs, runs, stats } = await getRevisionSelection();

  console.log("── stats ──");
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);

  console.log(`\n── execuções (${runs.length}) ──`);
  for (const r of runs) {
    console.log(
      `  ${r.outcome.padEnd(15)} v=${r.versions} retries=${r.judgeRetries}` +
        ` ${r.firstScore ?? "-"}→${r.finalScore ?? "-"}` +
        `${r.exhausted ? " [nunca aprovado]" : ""} | ${r.topic.slice(0, 40)}`,
    );
  }

  console.log(`\n── pares (${pairs.length}) ──`);
  for (const p of pairs) {
    const marca = p.inSample ? "FORM" : p.eligible ? "OK  " : "fora";
    console.log(
      `  ${marca} ${p.pairId.slice(0, 12)}…` +
        `v${p.before.version}→v${p.after.version} ${p.cause.padEnd(14)}` +
        ` ${p.before.judgement?.score ?? "-"}→${p.after.judgement?.score ?? "-"}` +
        ` (Δ ${p.deltaScore ?? "-"}) rótulos ${p.before.label ?? "-"}/${p.after.label ?? "-"}` +
        `${p.excludeReason ? ` [${p.excludeReason}]` : ""}` +
        `${p.sampleExclusion ? ` [fora do form: ${p.sampleExclusion}]` : ""}`,
    );
  }

  // Rótulos cegos têm que ser únicos e estáveis — é o que cruza com o Form.
  //
  // Uma versão da amostra reaparece como "antes" do par seguinte, que está fora
  // dela; ver o rótulo naquela linha é correto. O que seria erro é rótulo numa
  // versão que não participa de NENHUM par da amostra — letra sem post no form.
  const naAmostra = new Set(
    pairs.filter((p) => p.inSample).flatMap((p) => [p.before.id, p.after.id]),
  );
  const orfaos = pairs
    .flatMap((p) => [p.before, p.after])
    .filter((v) => v.label && !naAmostra.has(v.id)).length;
  console.log(
    `
rótulos órfãos (versão fora da amostra): ${orfaos}` +
      ` ${orfaos === 0 ? "✓" : "✗ VAZAMENTO"}`,
  );

  const labels = pairs
    .filter((p) => p.inSample)
    .flatMap((p) => [p.before, p.after])
    .map((v) => `${v.id}:${v.label}`);
  const unique = new Set(labels.map((l) => l.split(":")[1]));
  const versionIds = new Set(labels.map((l) => l.split(":")[0]));
  console.log(
    `\nrótulos: ${unique.size} distintos para ${versionIds.size} versões` +
      ` ${unique.size === versionIds.size ? "✓" : "✗ COLISÃO"}`,
  );

  // Caminho por thread (usado pelo ?threadId= do export).
  const sample = runs.find((r) => r.versions > 1) ?? runs[0];
  if (sample) {
    const [n, single] = await Promise.all([
      countVersions(sample.threadId),
      getRevisionPairs(sample.threadId),
    ]);
    const naSelecao = pairs.filter((p) => p.threadId === sample.threadId).length;
    console.log(
      `\npor thread ${sample.threadId.slice(0, 8)}…: ${n} versões, ${single.length} pares` +
        ` (seleção global diz ${naSelecao}) ${single.length === naSelecao ? "✓" : "✗ DIVERGE"}`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
