import "server-only";
import { cachedReader } from "@/app/MAS/lib/configCache";
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

// A matriz é lida em TODO layout do dashboard (getAccessMatrix) e de novo em
// TODA rota de API (canAccess, que fazia a própria query). Medido: 300ms por
// leitura, para uma tabela de 2 linhas — o banco está em outra região.
//
// Uma leitura só serve as duas funções. `canAccess` deixou de ir ao banco.
//
// Escrita invalida (saveAccessMatrix / resetAccessMatrix), então mudar uma
// permissão na tela continua valendo na hora. Alteração feita direto no banco
// leva até CONFIG_TTL_MS — resíduo assumido, igual ao cache de papéis.
const matrixCache = cachedReader<AccessMatrix>(
  "role_permissions",
  async () => {
    const matrix = defaultMatrix();
    const rows = await getDb().select().from(rolePermissions);
    for (const r of rows) {
      if (r.role !== "user" && r.role !== "colaborador") continue;
      if (!AREA_IDS.includes(r.area as Area)) continue;
      matrix[r.role][r.area as Area] = r.allowed;
    }
    return matrix;
  },
  () => defaultMatrix(),
);

/** Descarta o cache da matriz. Chamado por toda escrita. */
export function invalidateAccessMatrixCache(): void {
  matrixCache.invalidate();
}

/** Carrega a matriz para a memória no boot — ver src/instrumentation-node.ts. */
export async function preloadAccessMatrix(): Promise<void> {
  if (!isDbConfigured()) return;
  await matrixCache.preload();
}

/** A matriz inteira — o que a tela de permissões desenha. */
export async function getAccessMatrix(): Promise<AccessMatrix> {
  if (!isDbConfigured()) return defaultMatrix();
  // O cachedReader já cai no default e loga alto se o banco falhar — o
  // try/catch anterior virava ruído duplicado.
  return matrixCache.get();
}

/** A pergunta que páginas e rotas fazem. Admin passa sempre. */
export async function canAccess(role: Role, area: Area): Promise<boolean> {
  if (role === "admin") return true;
  if (!isDbConfigured()) return DEFAULT_ACCESS[role][area];
  // Sai do MESMO mapa em memória do getAccessMatrix. Antes era uma query por
  // checagem — e toda rota de API faz uma.
  const matrix = await matrixCache.get();
  // Área ausente do mapa (área nova, seed incompleto) cai no default do código,
  // que é conservador — nunca "liberado por omissão".
  return matrix[role]?.[area] ?? DEFAULT_ACCESS[role][area];
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
  // Mudar permissão na tela vale na hora, sem esperar o TTL.
  invalidateAccessMatrixCache();
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
