// middleware.ts
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;

  // Permitir estáticos y Next internals
  if (
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.startsWith("/assets")
  ) {
    return NextResponse.next();
  }

  // 🔓 Dejar públicas: home, rooms, login/registro, auth y GETs de rooms
  if (
    path === "/" ||
    path.startsWith("/rooms") ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Proteger dashboard y admin
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Requiere sesión
  if (path.startsWith("/dashboard") || path.startsWith("/admin")) {
    if (!token) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", url.pathname + url.search);
      return NextResponse.redirect(login);
    }
  }

  // Admin-only
  if (path.startsWith("/admin")) {
    if (token?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Solo interceptamos estas rutas; el resto (archivos) pasan.
  matcher: ["/((?!.*\\.).*)"],
};
