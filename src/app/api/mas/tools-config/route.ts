import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/app/MAS/lib/settingsStore";
import { NavigatorProvider } from "@/app/MAS/types/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS: NavigatorProvider[] = ["tavily", "brave"];

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ tools: settings.tools });
}

export async function PUT(req: NextRequest) {
  let body: { search?: { provider?: NavigatorProvider; maxResults?: number } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = await getSettings();
  const search = { ...current.tools.search };
  if (body.search?.provider && PROVIDERS.includes(body.search.provider)) {
    search.provider = body.search.provider;
  }
  if (typeof body.search?.maxResults === "number") {
    search.maxResults = Math.min(20, Math.max(1, Math.round(body.search.maxResults)));
  }

  await saveSettings({ ...current, tools: { search } });
  return NextResponse.json({ tools: { search } });
}
