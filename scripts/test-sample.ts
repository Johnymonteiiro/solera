import { getStudySelection } from "../src/app/MAS/lib/studySample";
import { ownerFromEnv } from "./owner";

async function main() {
  const s = await getStudySelection(ownerFromEnv());
  const anyS = s as unknown as Record<string, unknown>;
  console.log("chaves:", Object.keys(anyS).join(", "));
  const sample = (anyS.samples ?? []) as Array<Record<string, unknown>>;
  console.log(`amostra: ${sample.length} posts`);
  for (const p of sample) {
    console.log(`  ${p.label ?? "?"} | ${p.condition} | ${String(p.topic).slice(0, 40)}`);
  }
  const excluded = (anyS.excluded ?? []) as Array<Record<string, unknown>>;
  console.log(`excluídos: ${excluded.length}`);
  for (const e of excluded) console.log(`  fora: ${String(e.topic).slice(0,38)} | ${e.condition} | ${e.reason}`);
  process.exit(0);
}
main().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
