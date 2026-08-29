import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

// ─────────────────────────────────────────────────────────────────────────────
// Portão, não cadeado.
//
// O doc de autenticação do Next 16 é explícito: proxy serve para CHECAGEM
// OTIMISTA — barrar cedo quem claramente não tem sessão. A defesa real fica
// colada na fonte de dados (`ownerId` obrigatório nos stores, ver src/lib/dal.ts).
// Por isso aqui só se verifica o cookie: nada de banco, nada de decisão de posse.
//
// O matcher anterior era `/dashboard/:path*` e, como `(dashboard)` é route
// group, deixava de fora /posts, /agentes, /estudo, /configuracoes… e TODO o
// /api/**. Agora cobre tudo, menos o que precisa ser público.
// ─────────────────────────────────────────────────────────────────────────────

function unauthorized(req: NextRequest): NextResponse {
  // Requisição de API recebe 401 JSON; página recebe redirect. Se a API
  // redirecionasse, o fetch do client seguiria para /login e leria um HTML com
  // status 200 — que a UI trataria como sucesso.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export default async function proxy(req: NextRequest) {
  const session = req.cookies.get("session");
  if (!session) return unauthorized(req);

  try {
    await jwtVerify(session.value, secret);
    return NextResponse.next();
  } catch {
    return unauthorized(req);
  }
}

export const config = {
  // `api/auth` fica de fora senão o próprio login não roda (o callback do
  // LinkedIn chega sem sessão — é ele que a cria). `_next` INTEIRO fica de fora,
  // não só static/image: o `--webpack` do dev usa /_next/webpack-hmr, e um
  // redirect ali derruba o hot reload. São assets de build, não dado do usuário;
  // as requisições RSC continuam batendo no caminho real da página.
  matcher: ["/((?!login|api/auth|_next|favicon.ico|.*\\.png$).*)"],
};
