import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_IDS,
  AgentConfigMap,
  getAgentConfig,
  saveAgentConfig,
} from "@/app/MAS/lib/configStore";
import { requireAdmin, requireArea } from "@/lib/dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Ler a config dos agentes é a área `agentes`; GRAVAR continua sendo admin.
  const auth = await requireArea("agentes");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ agents: await getAgentConfig() });
}

// Admin-only, e esta é a mais sensível das quatro: `promptOverride` troca o
// prompt do Judge em RUNTIME, não é versionado, e já corrompeu todas as notas
// uma vez. Um segundo usuário mexendo aqui invalida o estudo em silêncio.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

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
  // `updatedBy` não é enfeite: o promptOverride muda o prompt do Judge em
  // runtime e já corrompeu todas as notas uma vez. Quando uma nota sair
  // estranha, "quem mexeu e quando" tem que ter resposta.
  await saveAgentConfig(current, auth.ownerId);
  return NextResponse.json({ agents: current });
}
