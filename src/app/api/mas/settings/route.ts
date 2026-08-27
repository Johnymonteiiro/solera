import { NextRequest, NextResponse } from "next/server";
import {
  ApiKeyName,
  Settings,
  getSettings,
  saveSettings,
} from "@/app/MAS/lib/settingsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEYS: ApiKeyName[] = [
  "OPENAI_API_KEY",
  "LLM_MODEL",
  "TAVILY_API_KEY",
  "BRAVE_API_KEY",
  "BRAVE_URL",
];

// GET devolve os valores salvos (o que o usuário editou) + se o .env tem fallback.
// Nunca vaza segredos do .env — só indica presença.
export async function GET() {
  const settings = await getSettings();
  const envPresent: Record<string, boolean> = {};
  for (const k of API_KEYS) envPresent[k] = !!process.env[k];
  const linkedinEnv = {
    clientId: !!process.env.LINKEDIN_CLIENT_ID,
    clientSecret: !!process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: !!process.env.LINKEDIN_REDIRECT_URI,
  };
  return NextResponse.json({ settings, envPresent, linkedinEnv });
}

// PUT mescla: só campos string não-vazios são gravados. String vazia limpa o override.
export async function PUT(req: NextRequest) {
  let body: { apiKeys?: Record<string, string>; linkedin?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = await getSettings();
  const next: Settings = {
    ...current,
    apiKeys: { ...current.apiKeys },
    linkedin: { ...current.linkedin },
  };

  if (body.apiKeys) {
    for (const k of API_KEYS) {
      const v = body.apiKeys[k];
      if (typeof v === "string") {
        if (v.trim()) next.apiKeys[k] = v.trim();
        else delete next.apiKeys[k];
      }
    }
  }
  if (body.linkedin) {
    for (const k of ["clientId", "clientSecret", "redirectUri"] as const) {
      const v = body.linkedin[k];
      if (typeof v === "string") {
        if (v.trim()) next.linkedin[k] = v.trim();
        else delete next.linkedin[k];
      }
    }
  }

  await saveSettings(next);
  return NextResponse.json({ ok: true });
}
