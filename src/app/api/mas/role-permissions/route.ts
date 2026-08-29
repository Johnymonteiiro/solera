import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import {
  AccessMatrix,
  getAccessMatrix,
  resetAccessMatrix,
  saveAccessMatrix,
} from "@/lib/permissions";
import { AREAS, AREA_IDS, isArea } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A matriz papel × área.
//
//   GET  /api/mas/role-permissions              → { matrix, areas }
//   PUT  /api/mas/role-permissions { matrix }   → grava
//   PUT  /api/mas/role-permissions { reset:true } → volta ao padrão
//
// Admin-only: quem edita a matriz define o que todo mundo alcança, então isto é
// permissão de admin por definição — NÃO passa pela própria matriz, senão
// alguém poderia se conceder o direito de se conceder direitos.

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ matrix: await getAccessMatrix(), areas: AREAS });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { matrix?: unknown; reset?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.reset) {
    return NextResponse.json({ matrix: await resetAccessMatrix(auth.ownerId) });
  }

  const incoming = body.matrix as Record<string, Record<string, unknown>>;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "matrix é obrigatório" }, { status: 400 });
  }

  // Parte da matriz atual e sobrepõe só o que veio válido: um corpo parcial não
  // pode zerar as áreas que ele não mencionou.
  const atual = await getAccessMatrix();
  const next: AccessMatrix = {
    user: { ...atual.user },
    colaborador: { ...atual.colaborador },
  };
  for (const role of ["user", "colaborador"] as const) {
    const patch = incoming[role];
    if (!patch || typeof patch !== "object") continue;
    for (const area of AREA_IDS) {
      const v = patch[area];
      if (typeof v === "boolean") next[role][area] = v;
    }
  }

  // `admin` é silenciosamente ignorado (não é editável) — ver lib/permissions.ts.
  const areasInvalidas = Object.keys(incoming.admin ?? {}).filter(
    (a) => !isArea(a),
  );
  if (areasInvalidas.length) {
    return NextResponse.json(
      { error: `área desconhecida: ${areasInvalidas.join(", ")}` },
      { status: 400 },
    );
  }

  await saveAccessMatrix(next, auth.ownerId);
  return NextResponse.json({ matrix: next });
}
