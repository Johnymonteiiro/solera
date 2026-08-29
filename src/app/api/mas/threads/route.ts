import { NextResponse } from "next/server";
import { listThreads } from "@/app/MAS/lib/threadStore";
import { requireArea } from "@/lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireArea("posts");
  if (!auth.ok) return auth.response;
  const ownerId = auth.ownerId;
  return NextResponse.json({ threads: await listThreads(ownerId) });
}
