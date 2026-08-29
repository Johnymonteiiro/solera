import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { Area, DEFAULT_ROLE, Role, atLeast } from "./roles";
import { canAccess } from "./permissions";
import { getUserAuth } from "./users";
import { getSession } from "./sessions";

// ─────────────────────────────────────────────────────────────────────────────
// Data Access Layer: quem está pedindo, e pode?
//
// Duas perguntas diferentes, e é importante não confundi-las:
//
//   IDENTIDADE  — quem é você. Vem do LinkedIn, viaja no JWT da sessão, e é o
//                 que determina QUAIS DADOS você alcança (`ownerId` obrigatório
//                 nos stores; uma query sem escopo não compila).
//   AUTORIZAÇÃO — o que você pode fazer. Vem da tabela `users`, é lida do banco
//                 a cada requisição, e é o que determina QUAIS AÇÕES você
//                 alcança. Ler do banco (e não do cookie) é o que faz um
//                 rebaixamento valer na hora, sem esperar o JWT de 60 dias.
//
// O proxy (src/proxy.ts) é PORTÃO — checagem otimista de cookie, boa pra UX e
// defesa em profundidade, e o doc do Next 16 é explícito em não tratá-lo como
// linha de defesa. A defesa real é este módulo mais o escopo dos stores.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Id do dono a partir da sessão, ou null se não houver sessão válida.
 *
 * Memoizado por request (`cache` do React): as páginas do dashboard fazem
 * várias leituras por render e a sessão é a mesma o tempo todo.
 */
/**
 * Quem está pedindo: identidade + papel, ou null.
 *
 * Uma consulta por requisição (`cache` do React) que resolve as duas perguntas
 * de uma vez. Conta DESATIVADA devolve null — para o resto do app é
 * indistinguível de não ter sessão, então o cookie de 60 dias deixa de valer no
 * instante em que um admin desliga a conta, sem precisar revogar nada.
 */
const getViewer = cache(
  async (): Promise<{ ownerId: string; role: Role } | null> => {
    const session = await getSession();
    const ownerId = session?.linkedinId;
    if (!ownerId) return null;

    // Break-glass: quem está em ADMIN_LINKEDIN_IDS entra mesmo desativado. É a
    // saída para quando ninguém mais alcança a tela de usuários.
    if (isEnvAdmin(ownerId)) return { ownerId, role: "admin" };

    try {
      const { role, active } = await getUserAuth(ownerId);
      if (!active) return null;
      return { ownerId, role };
    } catch (err) {
      // Banco fora do ar não pode virar escalação de privilégio nem porta
      // trancada: mantém a identidade e cai no menor papel.
      console.error("[dal] falha ao ler papel — assumindo o menor:", err);
      return { ownerId, role: DEFAULT_ROLE };
    }
  },
);

export const getOwnerId = cache(async (): Promise<string | null> => {
  return (await getViewer())?.ownerId ?? null;
});

/**
 * Papel de quem está pedindo, ou null sem sessão.
 *
 * `ADMIN_LINKEDIN_IDS` (CSV no .env.local) continua existindo como BREAK-GLASS:
 * força admin independente do banco. É a saída para quando ninguém consegue mais
 * entrar na tela de papéis — o caminho normal é a UI de configurações.
 */
export const getRole = cache(async (): Promise<Role | null> => {
  return (await getViewer())?.role ?? null;
});

function isEnvAdmin(ownerId: string): boolean {
  const raw = process.env.ADMIN_LINKEDIN_IDS?.trim();
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(ownerId);
}

/** Para Server Components: garante o dono ou manda para o login. */
export async function requireOwner(): Promise<string> {
  const ownerId = await getOwnerId();
  if (!ownerId) redirect("/login");
  return ownerId;
}

/**
 * Para Route Handlers: 401 JSON.
 *
 * Não pode ser redirect — o fetch do client seguiria para /login e receberia o
 * HTML da página de login com status 200, que a UI trataria como sucesso.
 */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Para Route Handlers: 403 JSON (autenticado, mas sem permissão). */
export function forbidden(role: Role, required: Role): NextResponse {
  return NextResponse.json(
    { error: "forbidden", role, required },
    { status: 403 },
  );
}

/**
 * O guarda que as rotas usam. Devolve dono + papel, ou a resposta pronta.
 *
 * A união obriga o call site a testar antes de usar o `ownerId` — mesma ideia do
 * parâmetro obrigatório nos stores: quem esquece não compila.
 *
 *   const auth = await requireRole("colaborador");
 *   if (!auth.ok) return auth.response;
 *   const dados = await getStudySelection(auth.ownerId);
 */
export async function requireRole(
  minimum: Role,
): Promise<
  | { ok: true; ownerId: string; role: Role }
  | { ok: false; response: NextResponse }
> {
  const ownerId = await getOwnerId();
  if (!ownerId) return { ok: false, response: unauthorized() };
  const role = (await getRole()) ?? DEFAULT_ROLE;
  if (!atLeast(role, minimum)) {
    return { ok: false, response: forbidden(role, minimum) };
  }
  return { ok: true, ownerId, role };
}

/** Atalho para as 4 rotas de config global. */
export function requireAdmin() {
  return requireRole("admin");
}

/**
 * Guarda por ÁREA — consulta a matriz `role_permissions`, que um admin edita na
 * tela de configurações. Use esta em vez de `requireRole` sempre que a pergunta
 * for "esta pessoa alcança esta página/recurso", que é o caso quase sempre.
 *
 * `requireRole` continua existindo para o que NÃO é área e não deve ser
 * configurável: gerenciar papéis e gravar config global são de admin por
 * definição, não por linha de tabela.
 */
export async function requireArea(
  area: Area,
): Promise<
  | { ok: true; ownerId: string; role: Role }
  | { ok: false; response: NextResponse }
> {
  const ownerId = await getOwnerId();
  if (!ownerId) return { ok: false, response: unauthorized() };
  const role = (await getRole()) ?? DEFAULT_ROLE;
  if (!(await canAccess(role, area))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "forbidden", role, area },
        { status: 403 },
      ),
    };
  }
  return { ok: true, ownerId, role };
}

/** Versão de Server Component: sem acesso à área, volta pro dashboard. */
export async function requireAreaPage(
  area: Area,
): Promise<{ ownerId: string; role: Role }> {
  const ownerId = await requireOwner();
  const role = (await getRole()) ?? DEFAULT_ROLE;
  if (!(await canAccess(role, area))) {
    // `config` é a única área que não pode redirecionar para /dashboard sem
    // risco de laço: se alguém perder o dashboard também, os dois se apontariam.
    redirect(area === "dashboard" ? "/posts" : "/dashboard");
  }
  return { ownerId, role };
}

/** Para Server Components: papel mínimo ou volta pro dashboard. */
export async function requireRolePage(minimum: Role): Promise<{
  ownerId: string;
  role: Role;
}> {
  const ownerId = await requireOwner();
  const role = (await getRole()) ?? DEFAULT_ROLE;
  // Redirect, não 403: a pessoa está logada e tem para onde ir. Uma tela de erro
  // aqui seria beco sem saída no meio do dashboard.
  if (!atLeast(role, minimum)) redirect("/dashboard");
  return { ownerId, role };
}
