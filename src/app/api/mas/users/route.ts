import { NextRequest, NextResponse } from "next/server";
import { requireArea } from "@/lib/dal";
import { isRole } from "@/lib/roles";
import { listUsers, setUserActive, setUserRole } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gestão de pessoas: papel e status da conta.
//
//   GET   /api/mas/users                            → { users }
//   PATCH /api/mas/users { linkedinId, role }       → troca o papel
//   PATCH /api/mas/users { linkedinId, active }     → liga/desliga a conta
//
// Área `users` na matriz (padrão: só admin). Não existe DELETE: apagar a linha
// apagaria o registro de quem é dono das execuções dela — para tirar o acesso,
// desative; `runs.owner_id` continua apontando para alguém que existe.

export async function GET() {
  const auth = await requireArea("users");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ users: await listUsers() });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireArea("users");
  if (!auth.ok) return auth.response;

  let body: { linkedinId?: string; role?: unknown; active?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { linkedinId } = body;
  if (!linkedinId || typeof linkedinId !== "string") {
    return NextResponse.json({ error: "linkedinId é obrigatório" }, { status: 400 });
  }

  const mudaPapel = body.role !== undefined;
  const mudaStatus = body.active !== undefined;
  if (!mudaPapel && !mudaStatus) {
    return NextResponse.json(
      { error: "informe role ou active" },
      { status: 400 },
    );
  }

  // ─── Papel ────────────────────────────────────────────────────────────────
  if (mudaPapel) {
    if (!isRole(body.role)) {
      return NextResponse.json(
        { error: "role deve ser: user, colaborador ou admin" },
        { status: 400 },
      );
    }
    const r = await setUserRole(linkedinId, body.role);
    if (!r.ok) return erro(r.reason);
  }

  // ─── Status da conta ──────────────────────────────────────────────────────
  if (mudaStatus) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json(
        { error: "active deve ser booleano" },
        { status: 400 },
      );
    }
    // Desativar a si mesmo é sempre recusado, mesmo havendo outros admins: a
    // pessoa perderia a sessão no mesmo instante e não teria como desfazer.
    if (linkedinId === auth.ownerId && body.active === false) {
      return NextResponse.json(
        {
          error: "self_deactivate",
          message: "Você não pode desativar a própria conta.",
        },
        { status: 409 },
      );
    }
    const r = await setUserActive(linkedinId, body.active);
    if (!r.ok) return erro(r.reason);
  }

  const atualizados = await listUsers();
  const user = atualizados.find((u) => u.linkedinId === linkedinId);
  return NextResponse.json({ user, users: atualizados });
}

function erro(reason: "not_found" | "last_admin"): NextResponse {
  if (reason === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    {
      error: "last_admin",
      message: "Promova ou ative outro admin antes de mexer neste.",
    },
    { status: 409 },
  );
}
