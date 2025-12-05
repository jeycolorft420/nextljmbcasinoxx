// middleware.ts
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;

  // estáticos
  if (
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.startsWith("/assets")
  ) {
    return NextResponse.next();
  }

  // 🔓 públicas
  if (
    path === "/" ||
    path.startsWith("/rooms") ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/support") ||         // <----- AÑADIDO
    path.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // protegidas
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (path.startsWith("/dashboard") || path.startsWith("/admin")) {
    if (!token) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", url.pathname + url.search);
      return NextResponse.redirect(login);
    }
  }

  if (path.startsWith("/admin")) {
    if ((token as any)?.role !== "admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
