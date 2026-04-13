import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

export interface Session {
  accessToken: string;
  linkedinId: string;
  name: string;
  email: string;
}

export async function createSession(data: Session) {
  const token = await new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("60d")
    .sign(secret);

  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 60, // 60 dias
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  const cookie = (await cookies()).get("session");
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie.value, secret);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  (await cookies()).delete("session");
}