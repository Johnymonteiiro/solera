import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, isDbConfigured, rolePermissions } from "@/db";
import { AREAS, AREA_IDS, Area, DEFAULT_ACCESS, Role } from "./roles";

// ─────────────────────────────────────────────────────────────────────────────
// A matriz papel × área, agora dado (tabela `role_permissions`) em vez de
// constante no código.
//
// `admin` NUNCA é consultado nem persistido: tem acesso total por definição.
// Se a matriz pudesse negar algo a admin, um clique errado na própria tela de
// permissões trancaria todo mundo para fora dela, sem saída pela UI.
//
// Banco fora do ar ⇒ cai no DEFAULT_ACCESS do código. Negar tudo transformaria
// um soluço do Postgres em app inutilizável; liberar tudo seria escalação de
// privilégio. O default é a política que já estava valendo.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessMatrix = Record<Exclude<Role, "admin">, Record<Area, boolean>>;

export function defaultMatrix(): AccessMatrix {
  return {
    user: { ...DEFAULT_ACCESS.user },
    colaborador: { ...DEFAULT_ACCESS.colaborador },
  };
}

/** A matriz inteira — o que a tela de permissões desenha. */
export async function getAccessMatrix(): Promise<AccessMatrix> {
  const matrix = defaultMatrix();
  if (!isDbConfigured()) return matrix;

  try {
    const rows = await getDb().select().from(rolePermissions);
    for (const r of rows) {
      if (r.role !== "user" && r.role !== "colaborador") continue;
      if (!AREA_IDS.includes(r.area as Area)) continue;
      matrix[r.role][r.area as Area] = r.allowed;
    }
  } catch (err) {
    console.error("[permissions] falha ao ler a matriz — usando o default:", err);
  }
  return matrix;
}

/** A pergunta que páginas e rotas fazem. Admin passa sempre. */
export async function canAccess(role: Role, area: Area): Promise<boolean> {
  if (role === "admin") return true;
  if (!isDbConfigured()) return DEFAULT_ACCESS[role][area];
  try {
    const [row] = await getDb()
      .select({ allowed: rolePermissions.allowed })
      .from(rolePermissions)
      .where(
        and(eq(rolePermissions.role, role), eq(rolePermissions.area, area)),
      )
      .limit(1);
    // Linha ausente (área nova, seed incompleto) cai no default do código, que
    // é conservador — nunca "liberado por omissão".
    return row?.allowed ?? DEFAULT_ACCESS[role][area];
  } catch (err) {
    console.error(`[permissions] falha ao checar ${role}/${area}:`, err);
    return DEFAULT_ACCESS[role][area];
  }
}

/**
 * Grava a matriz inteira. Ignora qualquer coisa vinda para `admin` — ele não é
 * editável, e aceitar o campo abriria justamente o caminho do auto-trancamento.
 */
export async function saveAccessMatrix(
  next: AccessMatrix,
  updatedBy: string | null,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  for (const role of ["user", "colaborador"] as const) {
    for (const area of AREA_IDS) {
      const allowed = !!next[role]?.[area];
      await db
        .insert(rolePermissions)
        .values({ role, area, allowed, updatedAt: now, updatedBy })
        .onConflictDoUpdate({
          target: [rolePermissions.role, rolePermissions.area],
          set: { allowed, updatedAt: now, updatedBy },
        });
    }
  }
}

/** Volta à política inicial — o botão "Restaurar padrão" da tela. */
export async function resetAccessMatrix(
  updatedBy: string | null,
): Promise<AccessMatrix> {
  const padrao = defaultMatrix();
  await saveAccessMatrix(padrao, updatedBy);
  return padrao;
}

export { AREAS, AREA_IDS };
export type { Area };
