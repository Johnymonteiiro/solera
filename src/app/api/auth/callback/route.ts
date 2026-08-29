import { resolveLinkedIn } from "@/app/MAS/lib/settingsStore";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/sessions";
import { upsertUserOnLogin } from "@/lib/users";

/** ALLOWED_LINKEDIN_EMAILS: CSV, case-insensitive. Vazio ⇒ todo mundo entra. */
function isAllowed(email: unknown): boolean {
  const raw = process.env.ALLOWED_LINKEDIN_EMAILS?.trim();
  if (!raw) return true;
  const permitidos = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (permitidos.length === 0) return true;
  if (typeof email !== "string") return false;
  return permitidos.includes(email.trim().toLowerCase());
}

export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = (await cookies()).get("oauth_state")?.value;

  // Valida state (proteção CSRF)
  if (!state || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  // Troca o code pelo access_token
  const linkedin = await resolveLinkedIn();
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: linkedin.redirectUri ?? "",
      client_id: linkedin.clientId ?? "",
      client_secret: linkedin.clientSecret ?? "",
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/login?error=token_failed", req.url));
  }

  // Busca dados do perfil
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();

  // Allowlist de ENTRADA. Sem isto, qualquer conta LinkedIn do mundo cria sessão
  // e passa a executar runs na chave OpenAI daqui — o isolamento por dono separa
  // os dados de cada um, mas não impede o estranho de entrar.
  // Vazia ⇒ libera (é o default de dev, não quebra instalação de um usuário só).
  if (!isAllowed(profile.email)) {
    return NextResponse.redirect(new URL("/login?error=not_allowed", req.url));
  }

  // Registra a pessoa e resolve o papel ANTES de criar a sessão: se o banco
  // estiver fora, é melhor falhar o login do que abrir uma sessão sem saber o
  // que ela pode fazer. O primeiro a logar vira admin (bootstrap) — ver
  // src/lib/users.ts.
  try {
    const registro = await upsertUserOnLogin({
      linkedinId: profile.sub,
      name: profile.name,
      email: profile.email,
    });
    // Conta desativada por um admin: nenhuma sessão é criada. Diferente da
    // allowlist, isto é operável pela UI e vale para quem já entrou antes.
    if (!registro.ok) {
      return NextResponse.redirect(new URL("/login?error=inactive", req.url));
    }
  } catch (err) {
    console.error("[auth/callback] falha ao registrar usuário:", err);
    return NextResponse.redirect(new URL("/login?error=user_store", req.url));
  }

  // Salva sessão no cookie
  await createSession({
    accessToken: tokenData.access_token,
    linkedinId: profile.sub,
    name: profile.name,
    email: profile.email,
  });

  (await cookies()).delete("oauth_state");

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
