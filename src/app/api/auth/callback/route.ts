import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/sessions";

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
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
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
