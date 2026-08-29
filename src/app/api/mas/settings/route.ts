import { NextRequest, NextResponse } from "next/server";
import { readAll, writeKeys } from "@/app/MAS/lib/settingsStore";
import { getRole, requireAdmin, requireArea } from "@/lib/dal";
import { FieldState, SETTING_FIELDS } from "@/lib/settings-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Contrato PLANO, por chave — espelha a tabela `app_settings` e as abas da tela
// (API Key = campos secretos, Variáveis = o resto). A forma aninhada antiga
// (`{apiKeys, linkedin, tools, study}`) era herança do settings.json e obrigava
// a UI a traduzir de um lado e a rota do outro.

/** Presença + últimos 4 caracteres. O bastante pra conferir QUAL chave está lá. */
function mask(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return v.length <= 4 ? "••••" : `…${v.slice(-4)}`;
}

// GET: o que está configurado, NUNCA o segredo em si.
//
// Antes daqui saía o `settings` inteiro — OPENAI_API_KEY e o clientSecret do
// LinkedIn em texto puro, para qualquer um, sem login.
export async function GET() {
  // Área `config` na matriz: quem alcança a tela lê a config. Só o PUT é admin.
  const auth = await requireArea("config");
  if (!auth.ok) return auth.response;

  const stored = await readAll();
  const state: Record<string, FieldState> = {};

  for (const f of SETTING_FIELDS) {
    const saved = stored.get(f.key) ?? "";
    state[f.key] = {
      set: !!saved,
      masked: f.secret ? mask(saved) : "",
      // Segredo não volta nem para admin: o valor está no banco, e a tela não
      // precisa dele para editar — digitar substitui, apagar limpa.
      ...(f.secret ? {} : { value: saved }),
      env: !!process.env[f.envVar ?? f.key],
    };
  }

  return NextResponse.json({
    state,
    // A UI desabilita o formulário em vez de deixar digitar e só descobrir o
    // 403 no submit.
    canEdit: (await getRole()) === "admin",
  });
}

// PUT { values: { CHAVE: "valor" } }
//
// Chave AUSENTE = não mexer; chave presente e vazia = limpar o override (volta
// a valer o .env). A UI depende dessa distinção: como os segredos não voltam no
// GET, ela só manda o que foi digitado — se ausência significasse "limpar",
// abrir a tela e salvar apagaria todas as chaves.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "values é obrigatório" }, { status: 400 });
  }

  const entries: Record<string, string> = {};
  const desconhecidas: string[] = [];
  for (const [key, raw] of Object.entries(body.values)) {
    const campo = SETTING_FIELDS.find((f) => f.key === key);
    if (!campo) {
      desconhecidas.push(key);
      continue;
    }
    if (typeof raw !== "string") continue;
    entries[key] = raw;
  }

  // Recusa em vez de ignorar em silêncio: chave errada quase sempre é typo, e
  // gravar nada enquanto a UI diz "salvo" é pior que um 400.
  if (desconhecidas.length) {
    return NextResponse.json(
      { error: `chave desconhecida: ${desconhecidas.join(", ")}` },
      { status: 400 },
    );
  }

  await writeKeys(entries, auth.ownerId);
  return NextResponse.json({ ok: true });
}
