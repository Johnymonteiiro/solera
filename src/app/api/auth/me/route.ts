import { NextResponse } from "next/server";
import { getRole } from "@/lib/dal";
import { getSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Identidade e papel do usuário logado.
 *
 * O `linkedinId` é o valor que vira `runs.owner_id` — esta rota é como você
 * descobre o seu id sem abrir o cookie na mão (o backfill precisa dele).
 *
 * O `role` vem do BANCO, não do cookie: é o mesmo valor que as rotas usam para
 * decidir, então a UI nunca mostra um botão que o servidor vai recusar.
 *
 * NUNCA devolve o accessToken: ele publica no LinkedIn em nome do usuário, e a
 * sessão é httpOnly justamente para o JS da página não alcançá-lo.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    linkedinId: session.linkedinId,
    name: session.name,
    email: session.email,
    role: await getRole(),
  });
}
