// src/components/NavBar.tsx
'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

import { useWallet } from "@/hooks/use-wallet";

// === Hook: polling de saldo eliminada, usamos contexto ===

export default function NavBar() {
  const { data: session, status } = useSession();
  const user = session?.user as any | undefined;
  const isAdmin = user?.role === "admin";
  const pathname = usePathname();

  const onLogin = pathname?.startsWith("/login");
  const onRegister = pathname?.startsWith("/register");

  const [open, setOpen] = useState(false);

  // Usar contexto global
  const { balanceCents } = useWallet();
  const saldo = typeof balanceCents === "number" ? `$${(balanceCents / 100).toFixed(2)}` : null;

  // no mostrar navegación completa si NO hay sesión
  const showMainNav = status === "authenticated";

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Logo"
              width={60}
              height={60}
              className="rounded"
            />
          </Link>

          {/* Nav (desktop) */}
          {showMainNav && (
            <nav className="ml-4 hidden md:flex items-center gap-1">
              <NavItem href="/rooms">Salas</NavItem>
              <NavItem href="/dashboard">Dashboard</NavItem>
              <NavItem href="/profile">Perfil</NavItem>
              <NavItem href="/shop">Tienda</NavItem>
              {isAdmin && (
                <NavItem href="/admin">Admin</NavItem>
              )}
            </nav>
          )}
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-2">
          {/* Saldo pill (si está autenticado) */}
          {status === "authenticated" && saldo && (
            <span
              className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white"
              title="Saldo disponible"
            >
              {saldo}
            </span>
          )}

          {/* Botones auth (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            {status === "loading" && (
              <span className="text-gray-400 text-sm">cargando…</span>
            )}
            {status === "unauthenticated" && (
              <>
                {onLogin && (
                  <NavItem href="/register">Registrarse</NavItem>
                )}
                {onRegister && (
                  <NavItem href="/login">Login</NavItem>
                )}
                {!onLogin && !onRegister && (
                  <>
                    <NavItem href="/login">Login</NavItem>
                    <NavItem href="/register">Registrarse</NavItem>
                  </>
                )}
                <button
                  onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
                  className="px-3 py-1.5 rounded-md text-sm bg-white/10 text-white hover:bg-white/20"
                >
                  Entrar
                </button>
              </>
            )}
            {status === "authenticated" && (
              <>
                <span className="text-gray-300 text-sm">
                  {user?.name || user?.email} {isAdmin ? "· admin" : ""}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="px-3 py-1.5 rounded-md text-sm bg-white/10 text-white hover:bg-white/20"
                >
                  Cerrar sesión
                </button>
              </>
            )}
          </div>

          {/* Saldo pill (MÓVIL) a la izquierda del botón hamburguesa */}
          {status === "authenticated" && saldo && (
            <span
              className="sm:hidden inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-medium text-white mr-1"
              title="Saldo disponible"
            >
              {saldo}
            </span>
          )}

          {/* Hamburguesa */}
          <button
            aria-label="Abrir menú"
            onClick={() => setOpen((o) => !o)}
            className="md:hidden relative h-9 w-9 rounded-md border border-white/15 bg-white/10 hover:bg-white/20 transition"
          >
            {/* ícono hamburguesa => X con transición */}
            <span
              className={`absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 -translate-y-2 bg-white transition ${open ? "rotate-45 translate-y-0" : ""
                }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 bg-white transition ${open ? "opacity-0" : ""
                }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 translate-y-2 bg-white transition ${open ? "-rotate-45 translate-y-0" : ""
                }`}
            />
          </button>
        </div>
      </div>

      {/* Menú móvil */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-black/80 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-1">
            {showMainNav ? (
              <>
                <MobileLink href="/rooms" onClick={() => setOpen(false)}>Salas</MobileLink>
                <MobileLink href="/dashboard" onClick={() => setOpen(false)}>Dashboard</MobileLink>
                <MobileLink href="/shop" onClick={() => setOpen(false)}>Tienda</MobileLink>
                <MobileLink href="/profile" onClick={() => setOpen(false)}>Perfil</MobileLink>
                {isAdmin && (
                  <MobileLink href="/admin" onClick={() => setOpen(false)}>
                    Admin
                  </MobileLink>
                )}
              </>
            ) : (
              <>
                {onLogin && (
                  <MobileLink href="/register" onClick={() => setOpen(false)}>
                    Registrarse
                  </MobileLink>
                )}
                {onRegister && (
                  <MobileLink href="/login" onClick={() => setOpen(false)}>
                    Login
                  </MobileLink>
                )}
                {!onLogin && !onRegister && (
                  <>
                    <MobileLink href="/login" onClick={() => setOpen(false)}>
                      Login
                    </MobileLink>
                    <MobileLink href="/register" onClick={() => setOpen(false)}>
                      Registrarse
                    </MobileLink>
                  </>
                )}
              </>
            )}

            <div className="mt-2 border-t border-white/10 pt-2">
              {status === "unauthenticated" && (
                <button
                  onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
                  className="w-full px-3 py-2 rounded-md text-sm bg-white/10 text-white hover:bg-white/20"
                >
                  Entrar
                </button>
              )}
              {status === "authenticated" && (
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full px-3 py-2 rounded-md text-sm bg-white/10 text-white hover:bg-white/20"
                >
                  Cerrar sesión
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-white/90 hover:bg-white/10 transition"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-2 py-2 rounded text-white/90 hover:bg-white/10 transition"
    >
      {children}
    </Link>
  );
}
