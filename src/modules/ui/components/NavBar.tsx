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

  // Hide NavBar on mobile ONLY inside specific ROOM pages (game view, e.g. /rooms/123)
  // Exclude /rooms (lobby), /rooms/roulette (category), /rooms/dice (category)
  const isGameRoom = pathname?.startsWith("/rooms/") &&
    !["/rooms", "/rooms/roulette", "/rooms/dice"].includes(pathname);

  return (
    <header className={`sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur ${isGameRoom ? "hidden sm:block" : ""}`}>
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
          <button aria-label="Abrir menú" onClick={() => setOpen((o) => !o)} className="md:hidden relative h-9 w-9 flex items-center justify-center rounded-md border border-white/15 bg-white/10 hover:bg-white/20 transition">
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 border-t border-white/10 bg-[#050505]/95 backdrop-blur-xl shadow-2xl h-[calc(100vh-64px)] overflow-y-auto z-40 animate-in fade-in slide-in-from-top-5 duration-200">
          {/* Gradient glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

          <div className="mx-auto max-w-lg px-6 py-8 flex flex-col gap-2 relative">
            {showMainNav ? (
              <nav className="flex flex-col gap-2">
                <MobileLink href="/rooms" onClick={() => setOpen(false)} icon={<DiceIcon />}>Salas de Juego</MobileLink>
                <MobileLink href="/dashboard" onClick={() => setOpen(false)} icon={<LayoutIcon />}>Dashboard</MobileLink>
                <MobileLink href="/shop" onClick={() => setOpen(false)} icon={<ShopIcon />}>Tienda</MobileLink>
                <MobileLink href="/profile" onClick={() => setOpen(false)} icon={<UserIcon />}>Mi Perfil</MobileLink>
                {user?.verificationStatus === "PENDING" && (
                  <MobileLink href="/verification" onClick={() => setOpen(false)} icon={<ShieldIcon />}>Verificar Cuenta</MobileLink>
                )}
                {isAdmin && <MobileLink href="/admin" onClick={() => setOpen(false)} icon={<LockIcon />}>Panel Admin</MobileLink>}
              </nav>
            ) : (
              <nav className="flex flex-col gap-2">
                <MobileLink href="/login" onClick={() => setOpen(false)} icon={<UserIcon />}>Iniciar Sesión</MobileLink>
                <MobileLink href="/register" onClick={() => setOpen(false)} icon={<ShieldIcon />}>Registrarse</MobileLink>
              </nav>
            )}

            <div className="mt-6 border-t border-white/10 pt-6">
              {status === "unauthenticated" && (
                <button onClick={() => signIn(undefined, { callbackUrl: "/dashboard" })} className="w-full py-3.5 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-lg shadow-primary/25">
                  Entrar
                </button>
              )}
              {status === "authenticated" && (
                <button onClick={() => signOut({ callbackUrl: "/" })} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-medium text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                  <LogOutIcon />
                  Cerrar sesión
                </button>
              )}
            </div>

            {/* Decoration */}
            <div className="mt-auto py-8 text-center">
              <p className="text-xs text-white/20 font-mono">777GALAXY v2.0</p>
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

function MobileLink({ href, children, onClick, icon }: { href: string; children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="group flex items-center gap-4 px-4 py-4 rounded-xl text-white/80 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all">
      {icon && <span className="opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all text-primary">{icon}</span>}
      <span className="font-medium text-lg">{children}</span>
      <span className="ml-auto opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-primary">→</span>
    </Link>
  );
}

// Simple Icons
const DiceIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M16 8h.01" /><path d="M8 8h.01" /><path d="M8 16h.01" /><path d="M16 16h.01" /><path d="M12 12h.01" /></svg>;
const LayoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>;
const ShopIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const ShieldIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const LockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
const LogOutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>;

