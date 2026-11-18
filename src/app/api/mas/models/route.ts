import { NextRequest, NextResponse } from "next/server";
import {
  addModel,
  isValidSlug,
  listModels,
  removeModel,
  setDefaultModel,
} from "@/app/MAS/lib/modelStore";
import { requireAdmin, requireArea } from "@/lib/dal";

// Catálogo de modelos do Writer. Mesma área da tela /agentes: ler é `agentes`,
// GRAVAR é admin — trocar o default muda o escritor de todo run seguinte, que
// é condição experimental do estudo.

export async function GET() {
  const auth = await requireArea("agentes");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ models: await listModels() });
}

async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Marca o default. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await readJson<{ defaultId?: string }>(req);
  const id = body?.defaultId?.trim();
  if (!id) return NextResponse.json({ error: "defaultId é obrigatório" }, { status: 400 });
  if (!(await setDefaultModel(id, auth.ownerId))) {
    return NextResponse.json({ error: "modelo não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ models: await listModels() });
}

/** Acrescenta um slug do OpenRouter ao catálogo. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await readJson<{ id?: string; label?: string }>(req);
  const id = body?.id?.trim() ?? "";
  if (!isValidSlug(id)) {
    return NextResponse.json(
      { error: "id precisa ser o slug do OpenRouter, no formato provedor/modelo (ex.: openai/gpt-4.1)" },
      { status: 400 },
    );
  }
  const label = body?.label?.trim() || id;
  if (!(await addModel(id, label, auth.ownerId))) {
    return NextResponse.json({ error: "modelo já está no catálogo" }, { status: 409 });
  }
  return NextResponse.json({ models: await listModels() }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const result = await removeModel(id);
  if (result === "not_found") {
    return NextResponse.json({ error: "modelo não encontrado" }, { status: 404 });
  }
  if (result === "is_default") {
    return NextResponse.json(
      { error: "o modelo padrão não pode ser removido; escolha outro padrão antes" },
      { status: 409 },
    );
  }
  return NextResponse.json({ models: await listModels() });
}
