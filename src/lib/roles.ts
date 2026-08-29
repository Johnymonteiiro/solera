// ─────────────────────────────────────────────────────────────────────────────
// Papéis e o que cada um alcança.
//
// Módulo FOLHA de propósito: sem `server-only`, sem banco, sem next/headers —
// a UI (client component) precisa dos mesmos rótulos e da mesma ordem que o
// servidor usa para decidir. Duas listas divergiriam na primeira mudança.
//
// A checagem que VALE é sempre a do servidor (src/lib/dal.ts). O que este módulo
// dá para o client é vocabulário, não permissão.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = ["user", "colaborador", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Papel de quem acabou de chegar. Também é o DEFAULT da coluna no banco. */
export const DEFAULT_ROLE: Role = "user";

// Escada de privilégio: um papel alcança tudo que os menores alcançam.
// Índice no array = nível; `atLeast` compara por ele.
const LEVEL: Record<Role, number> = { user: 0, colaborador: 1, admin: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Papel desconhecido (linha corrompida, papel removido) cai no menor. */
export function toRole(value: unknown): Role {
  return isRole(value) ? value : DEFAULT_ROLE;
}

/** `atLeast(papelDaPessoa, "colaborador")` — a pergunta que as rotas fazem. */
export function atLeast(role: Role, minimum: Role): boolean {
  return LEVEL[role] >= LEVEL[minimum];
}

export const ROLE_LABEL: Record<Role, string> = {
  user: "Usuário",
  colaborador: "Colaborador",
  admin: "Admin",
};

/** Texto mostrado na UI de configurações, ao lado de cada papel. */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  user: "Cria posts, revisa e publica os próprios. Não vê o estudo.",
  colaborador: "Tudo de usuário + página do estudo, exports e judge-repeat.",
  admin: "Tudo + chaves, config dos agentes, ferramentas e papéis.",
};

// ─── Áreas do app: as linhas da matriz de acesso ─────────────────────────────
//
// Uma "área" é uma página do dashboard mais as rotas que a alimentam. É a
// granularidade que a tela de permissões oferece — mais fino que isso (por
// botão) viraria config que ninguém consegue raciocinar sobre.

export const AREAS = [
  { id: "dashboard", label: "Dashboard", desc: "Visão geral do workspace" },
  { id: "posts", label: "Posts", desc: "Rascunhos, revisão e publicação" },
  { id: "agentes", label: "Configurar agentes", desc: "Prompts e pipeline dos agentes" },
  { id: "ferramentas", label: "Ferramentas", desc: "Busca, scraping e integrações" },
  { id: "analytics", label: "Analytics", desc: "Métricas de alcance e custo" },
  { id: "traces", label: "LangSmith traces", desc: "Execuções e depuração" },
  { id: "estudo", label: "Estudo", desc: "Experimentos, exports e judge-repeat" },
  { id: "users", label: "Usuários", desc: "Quem tem conta, atividade e status" },
  { id: "config", label: "Configurações", desc: "Chaves, variáveis e papéis" },
] as const;

export type Area = (typeof AREAS)[number]["id"];

export const AREA_IDS: Area[] = AREAS.map((a) => a.id);

export function isArea(value: unknown): value is Area {
  return typeof value === "string" && (AREA_IDS as string[]).includes(value);
}

/**
 * Política inicial, e também o fallback quando o banco não responde.
 *
 * `admin` não aparece: tem acesso total por definição e não é editável — ver
 * src/lib/permissions.ts.
 */
export const DEFAULT_ACCESS: Record<
  Exclude<Role, "admin">,
  Record<Area, boolean>
> = {
  user: {
    dashboard: true,
    posts: true,
    agentes: false,
    ferramentas: false,
    analytics: false,
    traces: false,
    estudo: false,
    users: false,
    config: false,
  },
  colaborador: {
    dashboard: true,
    posts: true,
    agentes: true,
    ferramentas: false,
    analytics: true,
    traces: true,
    estudo: true,
    users: false,
    config: false,
  },
};
