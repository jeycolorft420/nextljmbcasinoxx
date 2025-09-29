// src/components/NavBar.tsx
'use client';

import NavLink from "@/components/NavLink";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

// Hook para consultar saldo actual
function useBalancePoll() {
  const { status } = useSession();
  const [cents, setCents] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setCents(null);
      return;
    }

    let t: any;
    const load = async () => {
      try {
        const r = await fetch("/api/wallet/me", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          setCents(d.balanceCents ?? 0);
        }
      } catch (e) {
        console.error("wallet poll error:", e);
      }
    };

    load(); // primera carga
    t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);

    return () => clearInterval(t);
  }, [status]);

  return cents;
}

export default function NavBar() {
  const { data: session, status } = useSession();
  const user = session?.user as any | undefined;
  const isAdmin = user?.role === "admin";
  const cents = useBalancePoll();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-white font-bold text-lg">🎰 Ruleta12</div>
          <nav className="ml-4 flex items-center gap-1">
            <NavLink href="/">Inicio</NavLink>
            <NavLink href="/rooms">Salas</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
            {isAdmin && <NavLink href="/admin/rooms">Admin</NavLink>}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {status === "loading" && (
            <span className="text-gray-400 text-sm">cargando…</span>
          )}

          {status === "authenticated" && (
            <>
              {/* 👇 saldo */}
              {typeof cents === "number" && (
                <span className="text-gray-300 text-sm hidden sm:inline mr-2">
                  Saldo: ${(cents / 100).toFixed(2)}
                </span>
              )}
              <span className="text-gray-300 text-sm hidden sm:inline">
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

          {status === "unauthenticated" && (
            <>
              <NavLink href="/login">Login</NavLink>
              <NavLink href="/register">Registro</NavLink>
              <button
                onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })}
                className="px-3 py-1.5 rounded-md text-sm bg-white/10 text-white hover:bg-white/20"
              >
                Entrar
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
