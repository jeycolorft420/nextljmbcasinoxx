
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import Link from "next/link";
import { useDebounce } from "@/hooks/useDebounce"; // Assuming we might need one, or just standard timeout

// Simple debounce implementation inside if hook doesn't exist
function useDebounceValue(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

export default function UserConfigPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const debouncedSearch = useDebounceValue(search, 500);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/users?q=${debouncedSearch}&page=${page}`);
            const data = await res.json();

            if (data.error) {
                toast.error(data.error);
                return;
            }

            setUsers(data.users);
            setStats(data.stats);
            // Simple pagination logic assuming limit 20
            // logic for total pages? API returned hasMore, let's just use simple next/prev
        } catch (error) {
            toast.error("Error al cargar usuarios");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [debouncedSearch, page]);

    return (
        <main className="max-w-7xl mx-auto p-6 space-y-8 text-white min-h-screen">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/10 pb-6 gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">
                        GOD MODE: Usuarios
                    </h1>
                    <p className="text-slate-400 mt-1">Gestión total de la base de datos de jugadores.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchUsers} className="btn btn-ghost btn-circle">
                        🔄
                    </button>
                    <Link href="/admin" className="btn btn-outline border-white/20 text-white hover:bg-white/10">
                        Volver al Panel
                    </Link>
                </div>
            </header>

            {/* Stats Cards */}
            {stats && (
                <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-[#131b2e] border border-blue-500/20 p-4 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-6xl">👥</div>
                        <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Total Usuarios</p>
                        <p className="text-3xl font-mono text-white mt-1">{stats.totalUsers}</p>
                    </div>
                    <div className="bg-[#131b2e] border border-purple-500/20 p-4 rounded-2xl shadow-lg relative overflow-hidden group">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-6xl">🤖</div>
                        <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Bots Activos</p>
                        <p className="text-3xl font-mono text-purple-400 mt-1">{stats.totalBots}</p>
                    </div>
                    <div className="bg-[#131b2e] border border-green-500/20 p-4 rounded-2xl shadow-lg relative overflow-hidden group col-span-2">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-6xl">💰</div>
                        <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saldo Total en Plataforma</p>
                        <p className="text-3xl font-mono text-green-400 mt-1">
                            ${(stats.totalBalance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </section>
            )}

            {/* Search & Filters */}
            <div className="flex gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                    <input
                        type="text"
                        placeholder="Buscar por ID, Email, Nombre o Cédula..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-primary transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-[#131b2e] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-black/40 text-slate-400 uppercase text-xs font-bold tracking-wider">
                            <tr>
                                <th className="p-6">Usuario</th>
                                <th className="p-6">Rol</th>
                                <th className="p-6">Saldo</th>
                                <th className="p-6">Verificación</th>
                                <th className="p-6 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-slate-500">
                                        <span className="loading loading-spinner loading-lg"></span>
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-slate-500">
                                        No se encontraron usuarios.
                                    </td>
                                </tr>
                            ) : (
                                users.map((u) => (
                                    <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className="avatar placeholder">
                                                    <div className="bg-neutral text-neutral-content rounded-full w-10 h-10 border border-white/10">
                                                        {u.profilePhotoUrl ? (
                                                            <img src={u.profilePhotoUrl} alt={u.fullName || "?"} />
                                                        ) : (
                                                            <span className="text-xs">{u.email[0].toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="font-bold flex items-center gap-2">
                                                        {u.fullName || "Sin Nombre"}
                                                        {u.isBot && <span className="badge badge-xs badge-secondary">BOT</span>}
                                                    </div>
                                                    <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                                                    <div className="text-[10px] text-slate-600 font-mono mt-0.5">{u.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            {u.role === 'god' ? (
                                                <span className="badge badge-warning gap-1 font-bold">
                                                    👑 GOD
                                                </span>
                                            ) : u.role === 'admin' ? (
                                                <span className="badge badge-error gap-1">
                                                    🛡️ ADMIN
                                                </span>
                                            ) : (
                                                <span className="badge badge-ghost badge-sm text-slate-400">User</span>
                                            )}
                                        </td>
                                        <td className="p-6 font-mono font-bold text-green-400">
                                            ${(u.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-6">
                                            <div className={`badge font-bold ${u.verificationStatus === 'APPROVED' ? 'badge-success text-white' :
                                                    u.verificationStatus === 'PENDING' ? 'badge-warning' :
                                                        u.verificationStatus === 'REJECTED' ? 'badge-error text-white' :
                                                            'badge-ghost text-slate-500' // UNVERIFIED
                                                }`}>
                                                {u.verificationStatus}
                                            </div>
                                            {u.documentId && <div className="text-[10px] text-slate-500 mt-1 font-mono">ID: {u.documentId}</div>}
                                        </td>
                                        <td className="p-6 text-right">
                                            <Link
                                                href={`/admin/users/${u.id}`}
                                                className="btn btn-sm btn-outline btn-primary opacity-0 group-hover:opacity-100 transition-all transform hover:scale-105"
                                            >
                                                Gestionar ⚙️
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-4 border-t border-white/10 flex justify-between items-center bg-black/20">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="btn btn-sm btn-ghost disabled:bg-transparent disabled:text-slate-700"
                    >
                        ← Anterior
                    </button>
                    <span className="text-sm font-mono text-slate-500">Página {page}</span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={users.length < 20} // Simple check
                        className="btn btn-sm btn-ghost disabled:bg-transparent disabled:text-slate-700"
                    >
                        Siguiente →
                    </button>
                </div>
            </div>
        </main>
    );
}
