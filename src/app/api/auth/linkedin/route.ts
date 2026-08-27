import { resolveLinkedIn } from "@/app/MAS/lib/settingsStore";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  // state previne CSRF
  const state = randomBytes(16).toString("hex");

  (await cookies()).set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutos
    path: "/",
  });

  const linkedin = resolveLinkedIn();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: linkedin.clientId ?? "",
    redirect_uri: linkedin.redirectUri ?? "",
    state,
    scope: "openid profile email w_member_social",
  });

  return NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params}`
  );
}