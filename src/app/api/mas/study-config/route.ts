import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/app/MAS/lib/settingsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config do estudo: link do Google Form de avaliação humana.
export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ formUrl: settings.study.formUrl ?? "" });
}

export async function PUT(req: NextRequest) {
  let body: { formUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const formUrl = typeof body.formUrl === "string" ? body.formUrl.trim() : "";
  const current = await getSettings();
  await saveSettings({ ...current, study: { ...current.study, formUrl } });
  return NextResponse.json({ formUrl });
}
