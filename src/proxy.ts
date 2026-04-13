import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

export default async function proxy(req: NextRequest) {
  const session = req.cookies.get("session");
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(session.value, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};