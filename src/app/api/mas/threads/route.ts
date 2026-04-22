import { NextResponse } from "next/server";
import { listThreads } from "@/app/MAS/lib/threadStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ threads: listThreads() });
}
