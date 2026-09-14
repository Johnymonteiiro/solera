/**
 * Fecha o pool do Postgres antes de o script sair.
 *
 * `process.exit()` com conexão aberta não devolve o slot: o Supavisor (pooler
 * em modo transaction) segura o slot do cliente até o TCP morrer sozinho. Vários
 * scripts saindo assim deixam o processo SEGUINTE esperando por um slot — sem
 * erro, sem log, só lentidão que vira travamento. Foi o que aconteceu aqui.
 */
import { getDb, isDbConfigured } from "@/db";

export async function closeDb(): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    // O client fica no globalThis (ver src/db/index.ts); é ele que precisa
    // encerrar, não o wrapper do drizzle.
    getDb();
    await globalThis.__soleraSql?.end({ timeout: 5 });
  } catch {
    // Fechar é melhor-esforço: um erro aqui não pode mascarar o resultado do
    // script nem mudar seu código de saída.
  }
}
