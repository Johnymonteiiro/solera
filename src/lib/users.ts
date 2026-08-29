import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb, isDbConfigured, runs, users } from "@/db";
import { DEFAULT_ROLE, Role, toRole } from "./roles";

// ─────────────────────────────────────────────────────────────────────────────
// Registro de pessoas, papéis e status da conta.
//
// O LinkedIn AUTENTICA (quem é você); esta tabela AUTORIZA (o que você pode, e
// se ainda pode). São coisas separadas de propósito: a sessão continua sendo um
// JWT com o perfil, e papel + `active` são lidos do banco a cada requisição —
// assim rebaixar ou desativar alguém tem efeito imediato, sem esperar o cookie
// de 60 dias expirar.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppUser {
  linkedinId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  /** Execuções do MAS que pertencem a esta pessoa (runs.owner_id). */
  postCount: number;
  createdAt: string;
  lastLoginAt: string;
}

type Row = typeof users.$inferSelect;

function toUser(row: Row, postCount = 0): AppUser {
  return {
    linkedinId: row.linkedinId,
    name: row.name,
    email: row.email,
    role: toRole(row.role),
    active: row.active,
    postCount,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt.toISOString(),
  };
}

export type LoginResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: "inactive" };

/**
 * Grava (ou atualiza) a pessoa no login e devolve o papel efetivo.
 *
 * BOOTSTRAP: se a tabela está vazia, o primeiro a logar vira admin. É o que
 * resolve o ovo-e-galinha — sem isso não haveria ninguém para promover ninguém,
 * e a UI de papéis nasceria inalcançável. A partir do segundo, todo mundo entra
 * como `user` e depende de um admin para subir.
 *
 * `role` e `active` NUNCA são tocados no update: login não promove, não rebaixa
 * e — o que importa aqui — não reativa uma conta desligada. Só o nome, o e-mail
 * (que mudam no LinkedIn) e o último acesso.
 */
export async function upsertUserOnLogin(input: {
  linkedinId: string;
  name?: unknown;
  email?: unknown;
}): Promise<LoginResult> {
  const db = getDb();
  const now = new Date();
  const name = typeof input.name === "string" ? input.name : "";
  const email = typeof input.email === "string" ? input.email : "";

  // Conta desativada é barrada ANTES de qualquer escrita: nem o lastLoginAt
  // deve mexer, senão a tabela sugere atividade de quem não conseguiu entrar.
  const [existente] = await db
    .select({ active: users.active })
    .from(users)
    .where(eq(users.linkedinId, input.linkedinId))
    .limit(1);
  if (existente && !existente.active) return { ok: false, reason: "inactive" };

  // A corrida entre dois primeiros logins simultâneos é resolvida pelo
  // onConflict: o segundo insert vira update e NÃO reescreve o role, então no
  // pior caso os dois viram admin — o que só acontece se as duas pessoas forem
  // literalmente o primeiro acesso ao app.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users);
  const role: Role = total === 0 ? "admin" : DEFAULT_ROLE;

  const [row] = await db
    .insert(users)
    .values({
      linkedinId: input.linkedinId,
      name,
      email,
      role,
      active: true,
      createdAt: now,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: users.linkedinId,
      set: { name, email, lastLoginAt: now },
    })
    .returning();

  return { ok: true, user: toUser(row) };
}

/** Papel + status, numa query. É o que a DAL consulta a cada requisição. */
export async function getUserAuth(
  linkedinId: string,
): Promise<{ role: Role; active: boolean }> {
  if (!isDbConfigured()) return { role: DEFAULT_ROLE, active: true };
  const [row] = await getDb()
    .select({ role: users.role, active: users.active })
    .from(users)
    .where(eq(users.linkedinId, linkedinId))
    .limit(1);
  // Ausente do banco ⇒ o menor papel, nunca um maior. `active` true para não
  // trancar quem tem sessão válida numa instalação recém-migrada.
  return { role: toRole(row?.role), active: row?.active ?? true };
}

/**
 * Todo mundo que já logou, com quantos posts cada um gerou.
 *
 * O count sai de `runs.owner_id` com LEFT JOIN — quem nunca rodou o pipeline
 * aparece com 0 em vez de sumir da lista, que é justamente a informação útil
 * para um admin olhando a tabela.
 */
export async function listUsers(): Promise<AppUser[]> {
  if (!isDbConfigured()) return [];
  const rows = await getDb()
    .select({
      user: users,
      postCount: sql<number>`count(${runs.threadId})::int`,
    })
    .from(users)
    .leftJoin(runs, eq(runs.ownerId, users.linkedinId))
    .groupBy(users.linkedinId)
    .orderBy(asc(users.createdAt));
  return rows.map((r) => toUser(r.user, r.postCount));
}

export type MutateResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: "not_found" | "last_admin" };

/** Quantos admins ATIVOS existem além desta pessoa. */
async function outrosAdminsAtivos(linkedinId: string): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.role, "admin"),
        eq(users.active, true),
        ne(users.linkedinId, linkedinId),
      ),
    );
  return n;
}

/**
 * Troca o papel de alguém.
 *
 * Recusa rebaixar o ÚLTIMO admin ativo: sem essa trava, um admin se rebaixando
 * por engano deixaria a instalação sem ninguém capaz de mexer em chaves,
 * agentes ou papéis — e a única saída seria editar o banco na mão.
 */
export async function setUserRole(
  linkedinId: string,
  role: Role,
): Promise<MutateResult> {
  const db = getDb();
  const [alvo] = await db
    .select()
    .from(users)
    .where(eq(users.linkedinId, linkedinId))
    .limit(1);
  if (!alvo) return { ok: false, reason: "not_found" };

  if (toRole(alvo.role) === "admin" && role !== "admin" && alvo.active) {
    if ((await outrosAdminsAtivos(linkedinId)) === 0) {
      return { ok: false, reason: "last_admin" };
    }
  }

  const [row] = await db
    .update(users)
    .set({ role })
    .where(eq(users.linkedinId, linkedinId))
    .returning();
  return { ok: true, user: toUser(row) };
}

/**
 * Liga/desliga a conta.
 *
 * Desativar o último admin ativo é recusado pelo mesmo motivo do rebaixamento —
 * e aqui seria pior, porque a pessoa perderia até o login. Impedir que alguém
 * se desative sozinho é responsabilidade do route handler, que é quem sabe
 * quem está pedindo.
 */
export async function setUserActive(
  linkedinId: string,
  active: boolean,
): Promise<MutateResult> {
  const db = getDb();
  const [alvo] = await db
    .select()
    .from(users)
    .where(eq(users.linkedinId, linkedinId))
    .limit(1);
  if (!alvo) return { ok: false, reason: "not_found" };

  if (!active && toRole(alvo.role) === "admin" && alvo.active) {
    if ((await outrosAdminsAtivos(linkedinId)) === 0) {
      return { ok: false, reason: "last_admin" };
    }
  }

  const [row] = await db
    .update(users)
    .set({ active })
    .where(eq(users.linkedinId, linkedinId))
    .returning();
  return { ok: true, user: toUser(row) };
}
