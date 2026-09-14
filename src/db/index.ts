import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Route Handlers diferentes podem receber instâncias distintas deste módulo
// (mesma armadilha que já mordeu o threadStore e o checkpointer). Sem o
// singleton em globalThis cada rota abriria o próprio pool e o Supabase
// derrubaria as conexões por excesso. Ver lib/threadStore.ts.
declare global {
  var __soleraSql: ReturnType<typeof postgres> | undefined;
  var __soleraDb: ReturnType<typeof buildDb> | undefined;
}

function buildDb(client: ReturnType<typeof postgres>) {
  return drizzle(client, { schema });
}

/**
 * Cliente do banco, inicializado sob demanda.
 *
 * Lazy de propósito: o Next avalia código de topo de módulo no build, e
 * `postgres(undefined!)` derrubaria `next build` em qualquer máquina sem
 * DATABASE_URL. Também não use Proxy pra isso — quebra libs que inspecionam
 * o objeto do client.
 */
export function getDb() {
  if (globalThis.__soleraDb) return globalThis.__soleraDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Crie o projeto no Supabase e cole a " +
        "connection string (Settings → Database → Connection pooling) no .env.local.",
    );
  }

  // prepare:false é obrigatório no pooler em modo transaction (pgbouncer):
  // prepared statements não sobrevivem à troca de conexão do pool.
  //
  // Os timeouts NÃO são enfeite. O banco está em us-west-2 e cada query custa
  // ~300ms de RTT só de rede; quando o pooler demora a devolver um slot, a
  // chamada fica esperando. Sem teto, "esperando" vira "para sempre": foi assim
  // que o pipeline travou no researcher e um `select` por chave primária numa
  // tabela de UMA linha estourou o statement_timeout de 2min do servidor.
  // Falhar em segundos é recuperável (os escritores do estudo são fail-soft, a
  // DAL tenta de novo); pendurar não é.
  const client =
    globalThis.__soleraSql ??
    (globalThis.__soleraSql = postgres(url, {
      prepare: false,
      max: 5,
      // Conexão que não estabelece em 10s não vai estabelecer.
      connect_timeout: 10,
      // Devolve conexão ociosa ao pooler em vez de segurar o slot para sempre.
      // Com Supavisor em modo transaction, slot preso por processo morto é o
      // que faz o processo seguinte esperar sem erro nenhum.
      idle_timeout: 20,
      // Recicla conexão velha: evita socket meio-morto que só aparece na hora
      // do uso (o servidor ou um NAT no caminho derruba sem avisar).
      max_lifetime: 60 * 30,
    }));

  globalThis.__soleraDb = buildDb(client);
  return globalThis.__soleraDb;
}

/** true quando o banco está configurado — para degradar sem derrubar a app. */
export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

export * from "./schema";
