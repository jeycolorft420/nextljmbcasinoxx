"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface UserSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
}

export default function UserSidebar({ isOpen, onClose, user }: UserSidebarProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div
                className={`fixed top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-md border-l border-white/10 z-[70] transform transition-transform duration-300 shadow-2xl ${isOpen ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                <div className="p-6 flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-bold text-white">Mi Cuenta</h2>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    {/* User Info */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-3xl font-bold text-white mb-4 shadow-lg shadow-primary/20">
                            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                        </div>
                        <h3 className="text-lg font-bold text-white">{user?.name || "Usuario"}</h3>
                        <p className="text-sm text-slate-400">{user?.email}</p>
                        {(user?.role === "admin" || user?.role === "god") && (
                            <span className="mt-2 px-3 py-1 bg-primary/20 text-primary text-xs font-bold rounded-full uppercase tracking-wider">
                                Administrador
                            </span>
                        )}
                    </div>

                    {/* Menu Links */}
                    <nav className="flex-1 space-y-2">
                        <Link
                            href="/profile"
                            onClick={onClose}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-slate-200 hover:text-white transition-all group"
                        >
                            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            </div>
                            <span className="font-medium">Mi Perfil</span>
                        </Link>

                        <Link
                            href="/dashboard"
                            onClick={onClose}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-slate-200 hover:text-white transition-all group"
                        >
                            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                            </div>
                            <span className="font-medium">Dashboard</span>
                        </Link>

                        {(user?.role === "admin" || user?.role === "god") && (
                            <Link
                                href="/admin"
                                onClick={onClose}
                                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-slate-200 hover:text-white transition-all group"
                            >
                                <div className="p-2 rounded-lg bg-white/5 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.74 5.88-5.74 5.88-5.74-5.88z"></path><path d="M11 12.69l5.74 5.88-5.74 5.88-5.74-5.88z"></path></svg>
                                </div>
                                <span className="font-medium">Panel Admin</span>
                            </Link>
                        )}
                    </nav>

                    {/* Logout Button */}
                    <div className="pt-6 border-t border-white/10">
                        <button
                            onClick={() => signOut({ callbackUrl: "/" })}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-all group"
                        >
                            <div className="p-2 rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                            </div>
                            <span className="font-medium">Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
