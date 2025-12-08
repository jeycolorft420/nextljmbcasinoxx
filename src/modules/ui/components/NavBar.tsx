'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useWallet } from "@/hooks/use-wallet";

export default function NavBar() {
  const { data: session, status } = useSession();
  const user = session?.user as any | undefined;
  const isAdmin = user?.role === "admin" || user?.role === "god";
  const pathname = usePathname();

  const onLogin = pathname?.startsWith("/login");
  const onRegister = pathname?.startsWith("/register");

  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  // Fetch settings for logo and site name
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setSettings(data);
      })
      .catch((err) => console.error("Failed to load settings", err));
  }, []);

  const logoUrl = settings?.logoUrl || "/logo.png";
  const siteName = settings?.siteName || "777Galaxy";

  // Wallet balance
  const { balanceCents } = useWallet();
  const saldo = typeof balanceCents === "number"
    ? `$${(balanceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  const showMainNav = status === "authenticated";

  // Hide Navbar on room pages (they have their own tailored UI)
  if (pathname?.startsWith("/rooms/")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="relative w-16 h-16">
              <Image src={logoUrl} alt={siteName} fill className="object-contain" priority />
            </div>
            <span className="font-bold text-2xl tracking-tight hidden sm:block text-foreground">
              {siteName}
            </span>
          </Link>

          {/* Desktop navigation */}
          {showMainNav && (
            <nav className="ml-4 hidden md:flex items-center gap-1">
              <NavItem href="/rooms">Salas</NavItem>
              <NavItem href="/dashboard">Dashboard</NavItem>
              <NavItem href="/shop">Tienda</NavItem>
              {user?.verificationStatus === "PENDING" && (
                <NavItem href="/verification">Verificar</NavItem>
              )}
            </nav>
          )}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Balance pill (desktop) */}
          {status === "authenticated" && saldo && (
            <span className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white" title="Saldo disponible">
              {saldo}
            </span>
          )}

          {/* Auth buttons (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            {status === "loading" && <span className="text-gray-400 text-sm">cargando…</span>}
            {status === "unauthenticated" && (
              <>
                {onLogin && <NavItem href="/register">Registrarse</NavItem>}
                {onRegister && <NavItem href="/login">Login</NavItem>}
                {!onLogin && !onRegister && (
                  <>
                    <NavItem href="/login">Login</NavItem>
                    <NavItem href="/register">Registrarse</NavItem>
                  </>
                )}
                <button onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })} className="px-3 py-1.5 rounded-md text-sm bg-white/10 text-white hover:bg-white/20">
                  Entrar
                </button>
              </>
            )}
            {status === "authenticated" && (
              <div className="relative">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="relative h-10 w-10 rounded-full overflow-hidden border border-white/10 hover:border-primary/50 transition-colors" title="Mi Cuenta">
                  {user?.avatarUrl ? (
                    <Image src={user.avatarUrl} alt={user.name || "User"} fill className="object-cover" />
                  ) : (
                    <div className="h-full w-full bg-white/10 flex items-center justify-center text-white">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                </button>
                {sidebarOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden ring-1 ring-white/5">
                      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
                        <div className="relative h-10 w-10 rounded-full overflow-hidden border border-white/10 shrink-0">
                          {user?.avatarUrl ? (
                            <Image src={user.avatarUrl} alt={user.name || "User"} fill className="object-cover" />
                          ) : (
                            <div className="h-full w-full bg-white/10 flex items-center justify-center text-white">
                              <span className="text-xs font-bold">{user?.name?.[0]?.toUpperCase() || "U"}</span>
                            </div>
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-bold text-white truncate">{user?.name || "Usuario"}</p>
                          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                      </div>
                      <div className="p-2 space-y-1">
                        <Link href="/profile" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                          Mi Perfil
                        </Link>
                        <Link href="/dashboard" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                          Dashboard
                        </Link>
                        <Link href="/history" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                          Historial
                        </Link>
                        {isAdmin && (
                          <Link href="/admin" onClick={() => setSidebarOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.74 5.88-5.74 5.88-5.74-5.88z" /><path d="M11 12.69l5.74 5.88-5.74 5.88-5.74-5.88z" /></svg>
                            Panel Admin
                          </Link>
                        )}
                        <div className="h-px bg-white/10 my-1" />
                        <button onClick={() => signOut({ callbackUrl: "/" })} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                          Cerrar Sesión
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Balance pill (mobile) */}
          {status === "authenticated" && saldo && (
            <span className="sm:hidden inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-medium text-white mr-1" title="Saldo disponible">
              {saldo}
            </span>
          )}

          {/* Hamburger (mobile) */}
          <button aria-label="Abrir menú" onClick={() => setOpen((o) => !o)} className="md:hidden relative h-9 w-9 rounded-md border border-white/15 bg-white/10 hover:bg-white/20 transition">
            <span className={`absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 -translate-y-2 bg-white transition ${open ? "rotate-45 translate-y-0" : ""}`} />
            <span className={`absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 bg-white transition ${open ? "opacity-0" : ""}`} />
            <span className={`absolute left-1/2 top-1/2 h-0.5 w-5 -translate-x-1/2 translate-y-2 bg-white transition ${open ? "-rotate-45 translate-y-0" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/10 bg-black/80 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-1">
            {showMainNav ? (
              <>
                <MobileLink href="/rooms" onClick={() => setOpen(false)}>Salas</MobileLink>
                <MobileLink href="/dashboard" onClick={() => setOpen(false)}>Dashboard</MobileLink>
                <MobileLink href="/shop" onClick={() => setOpen(false)}>Tienda</MobileLink>
                <MobileLink href="/profile" onClick={() => setOpen(false)}>Perfil</MobileLink>
                {user?.verificationStatus === "PENDING" && (
                  <MobileLink href="/verification" onClick={() => setOpen(false)}>Verificar</MobileLink>
                )}
                {isAdmin && <MobileLink href="/admin" onClick={() => setOpen(false)}>Admin</MobileLink>}
              </>
            ) : (
              <>
                {onLogin && <MobileLink href="/register" onClick={() => setOpen(false)}>Registrarse</MobileLink>}
                {onRegister && <MobileLink href="/login" onClick={() => setOpen(false)}>Login</MobileLink>}
                {!onLogin && !onRegister && (
                  <>
                    <MobileLink href="/login" onClick={() => setOpen(false)}>Login</MobileLink>
                    <MobileLink href="/register" onClick={() => setOpen(false)}>Registrarse</MobileLink>
                  </>
                )}
              </>
            )}
            <div className="mt-2 border-t border-white/10 pt-2">
              {status === "unauthenticated" && (
                <button onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })} className="w-full px-3 py-2 rounded-md text-sm bg-white/10 text-white hover:bg-white/20">
                  Entrar
                </button>
              )}
              {status === "authenticated" && (
                <button onClick={() => signOut({ callbackUrl: "/" })} className="w-full px-3 py-2 rounded-md text-sm bg-white/10 text-white hover:bg-white/20">
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
    <Link href={href} className="px-3 py-1.5 rounded-md text-sm text-white/90 hover:bg-white/10 transition">
      {children}
    </Link>
  );
}

function MobileLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="block px-2 py-2 rounded text-white/90 hover:bg-white/10 transition">
      {children}
    </Link>
  );
}

