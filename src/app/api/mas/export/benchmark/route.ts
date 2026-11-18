import { NextResponse } from "next/server";
import { getBenchmark } from "@/app/MAS/lib/studyBenchmark";
import { requireArea } from "@/lib/dal";

// GET /api/mas/export/benchmark → médias do Judge por modelo do Writer, e a
// nota de cada tópico em cada modelo. Ver lib/studyBenchmark.ts.
export async function GET() {
  // Mesma área da tela de dados do estudo.
  const auth = await requireArea("estudo");
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getBenchmark(auth.ownerId));
}
