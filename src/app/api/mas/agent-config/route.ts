import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_IDS,
  AgentConfigMap,
  getAgentConfig,
  saveAgentConfig,
} from "@/app/MAS/lib/configStore";
import { listModels } from "@/app/MAS/lib/modelStore";
import { renderAgentPrompts } from "@/app/MAS/lib/promptPreview";
import { requireAdmin, requireArea } from "@/lib/dal";

export async function GET() {
  // Ler a config dos agentes é a área `agentes`; GRAVAR continua sendo admin.
  const auth = await requireArea("agentes");
  if (!auth.ok) return auth.response;
  const [agents, models] = await Promise.all([getAgentConfig(), listModels()]);
  return NextResponse.json({
    agents,
    // Só leitura: papel e prompt vêm do código (ver lib/configStore.ts).
    prompts: renderAgentPrompts(),
    // Opções do select de modelo — o catálogo da tela /modelos.
    models,
  });
}

// Admin-only. Desde 2026-09-18 só liga/desliga e modelo são graváveis: papel e
// prompt vêm do código, e um campo `role`/`promptOverride` no corpo é ignorado.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { agents?: Partial<Record<keyof AgentConfigMap, { enabled?: unknown; model?: unknown }>> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = body.agents;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "agents é obrigatório" }, { status: 400 });
  }

  const [current, models] = await Promise.all([getAgentConfig(), listModels()]);
  const catalogo = new Set(models.map((m) => m.id));
  for (const id of AGENT_IDS) {
    const patch = incoming[id];
    if (!patch) continue;
    let model = current[id].model;
    if (typeof patch.model === "string") {
      const pedido = patch.model.trim();
      // Só modelo do catálogo. O valor atual passa mesmo fora dele (ex.: o
      // `gpt-4o` implícito do Researcher/Analyst), senão salvar o liga/desliga
      // de um agente obrigaria a trocar o modelo dele junto.
      if (pedido !== current[id].model && !catalogo.has(pedido)) {
        return NextResponse.json(
          { error: `modelo "${pedido}" não está no catálogo (/modelos)` },
          { status: 400 },
        );
      }
      model = pedido;
    }
    current[id] = {
      ...current[id],
      enabled: typeof patch.enabled === "boolean" ? patch.enabled : current[id].enabled,
      model,
    };
  }
  // `updatedBy`: trocar o modelo do Judge obriga a re-pontuar o corpus, então
  // "quem mexeu e quando" tem que ter resposta.
  await saveAgentConfig(current, auth.ownerId);
  return NextResponse.json({ agents: current });
}
