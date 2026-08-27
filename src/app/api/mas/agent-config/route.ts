import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_IDS,
  AgentConfigMap,
  getAgentConfig,
  saveAgentConfig,
} from "@/app/MAS/lib/configStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ agents: await getAgentConfig() });
}

export async function PUT(req: NextRequest) {
  let body: { agents?: AgentConfigMap };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = body.agents;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "agents é obrigatório" }, { status: 400 });
  }

  // Mescla sobre a config atual, validando/sanitizando cada agente.
  const current = await getAgentConfig();
  for (const id of AGENT_IDS) {
    const patch = incoming[id];
    if (!patch) continue;
    current[id] = {
      enabled:
        typeof patch.enabled === "boolean"
          ? patch.enabled
          : current[id].enabled,
      role: typeof patch.role === "string" ? patch.role : current[id].role,
      promptOverride:
        typeof patch.promptOverride === "string"
          ? patch.promptOverride
          : current[id].promptOverride,
    };
  }
  await saveAgentConfig(current);
  return NextResponse.json({ agents: current });
}
