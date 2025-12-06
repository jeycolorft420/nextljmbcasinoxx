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
    path === "/rooms" ||
    path === "/rooms/dice" ||
    path === "/rooms/roulette" ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/support") ||
    path.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // protegidas
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Si intenta acceder a una ruta protegida sin token
  if (
    path.startsWith("/dashboard") ||
    path.startsWith("/admin") ||
    path.startsWith("/profile") ||
    path.startsWith("/shop") ||
    path.startsWith("/rooms/") // Cualquier otra ruta bajo /rooms/ (ej: /rooms/uuid)
  ) {
    if (!token) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", url.pathname + url.search);
      return NextResponse.redirect(login);
    }
  }

  if (path.startsWith("/admin")) {
    const role = (token as any)?.role;
    if (role !== "admin" && role !== "god") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
