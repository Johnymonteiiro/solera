import { listThreads } from "@/app/MAS/lib/threadStore";
import { requireArea } from "@/lib/dal";
import { NextRequest, NextResponse } from "next/server";

/** Teto absoluto: `?limit=99999` não pode virar um jeito de pedir a tabela toda. */
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;

  // Sem `?limit` a rota devolve tudo, como antes — quem chama sem parâmetro
  // (scripts, exports) não muda de comportamento.
  const bruto = req.nextUrl.searchParams.get("limit");
  let limit: number | undefined;
  if (bruto !== null) {
    const n = Number.parseInt(bruto, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "limit inválido. Use um inteiro positivo." },
        { status: 400 },
      );
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  return NextResponse.json({ threads: await listThreads(auth.ownerId, limit) });
}
