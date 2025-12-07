
"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import Image from "next/image";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Actions State
    const [balanceModalOpen, setBalanceModalOpen] = useState(false);
    const [balanceAction, setBalanceAction] = useState<"CREDIT" | "DEBIT">("CREDIT");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");

    const fetchUser = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/users/${id}`);
            const data = await res.json();
            if (data.error) {
                toast.error(data.error);
                return;
            }
            setUser(data.user);
            setStats(data.stats);
        } catch (e) {
            toast.error("Error cargando usuario");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUser();
    }, [id]);

    const handleBalanceAdjust = async () => {
        if (!amount || !reason) return toast.error("Completa los campos");

        try {
            const res = await fetch(`/api/admin/users/${id}/balance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amountCents: Math.round(parseFloat(amount) * 100), // Convert to cents
                    Type: balanceAction,
                    reason
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            toast.success("Saldo actualizado exitosamente");
            setBalanceModalOpen(false);
            setAmount("");
            setReason("");
            fetchUser(); // Refresh
        } catch (e: any) {
            toast.error(e.message || "Error al ajustar saldo");
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-white"><span className="loading loading-lg"></span></div>;
    if (!user) return <div className="text-white p-10">Usuario no encontrado</div>;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 text-white min-h-screen pb-20">
            {/* Header / Nav */}
            <div className="flex items-center gap-4">
                <Link href="/admin/users" className="btn btn-ghost btn-sm text-slate-400">← Volver a Lista</Link>
                <div className="flex-1" />
                <span className="text-xs font-mono text-slate-600 uppercase">ID: {user.id}</span>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* 1. Left Column: Profile Card */}
                <div className="space-y-6">
                    <div className="bg-[#131b2e] border border-white/10 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
                        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-primary/20 to-transparent opacity-50" />

                        <div className="relative flex flex-col items-center">
                            <div className="w-32 h-32 rounded-full border-4 border-[#131b2e] shadow-xl overflow-hidden bg-neutral mb-4 relative">
                                {user.profilePhotoUrl ? (
                                    <Image src={user.profilePhotoUrl} fill alt="Avatar" className="object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-4xl font-bold bg-slate-700">{user.email[0]}</div>
                                )}
                            </div>
                            <h1 className="text-2xl font-bold text-center">{user.fullName || "Sin Nombre"}</h1>
                            <p className="text-slate-400 font-mono text-sm mb-4">{user.email}</p>

                            <div className="flex gap-2 mb-6">
                                <span className={`badge ${user.role === 'god' ? 'badge-warning' : 'badge-ghost'}`}>{user.role}</span>
                                <span className={`badge ${user.verificationStatus === 'APPROVED' ? 'badge-success text-white' : 'badge-warning'}`}>{user.verificationStatus}</span>
                                {user.isBot && <span className="badge badge-secondary">BOT</span>}
                            </div>

                            <div className="w-full bg-black/40 rounded-xl p-4 text-center border border-white/5">
                                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Saldo Actual</p>
                                <p className="text-4xl font-mono font-bold text-green-400">
                                    ${(user.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </p>
                            </div>

                            <button
                                onClick={() => setBalanceModalOpen(true)}
                                className="btn btn-primary w-full mt-6 shadow-lg shadow-primary/20"
                            >
                                💰 Ajustar Saldo / Recargar
                            </button>
                        </div>
                    </div>

                    {/* Personal Details */}
                    <div className="bg-[#131b2e] border border-white/10 rounded-3xl p-6 shadow-xl">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">📄 Datos Personales</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-slate-500">Documento ID</span>
                                <span className="font-mono">{user.documentId || "N/A"}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-slate-500">Fecha Nacimiento</span>
                                <span>{user.dob ? new Date(user.dob).toLocaleDateString() : "N/A"}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-slate-500">Teléfono</span>
                                <span className="font-mono">{user.phoneNumber || "N/A"}</span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-2">
                                <span className="text-slate-500">Username</span>
                                <span className="text-primary font-bold">{user.username ? `@${user.username}` : "N/A"}</span>
                            </div>
                            <div className="flex justify-between pt-2">
                                <span className="text-slate-500">Registrado</span>
                                <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Middle & Right: Stats & History */}
                <div className="lg:col-span-2 space-y-8">

                    {/* KYC Gallery */}
                    {(user.idFrontUrl || user.idBackUrl || user.selfieUrl) && (
                        <div className="bg-[#131b2e] border border-white/10 rounded-3xl p-6">
                            <h3 className="text-lg font-bold mb-4">📸 Evidencias KYC</h3>
                            <div className="flex gap-4 overflow-x-auto pb-2"> // Carousel effect
                                {[
                                    { src: user.idFrontUrl, label: "Frente" },
                                    { src: user.idBackUrl, label: "Reverso" },
                                    { src: user.selfieUrl, label: "Selfie" },
                                ].map((img, i) => img.src && (
                                    <div key={i} className="flex-none w-48 group">
                                        <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/10 relative">
                                            <a href={img.src} target="_blank" className="block w-full h-full cursor-zoom-in">
                                                <img src={img.src} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                            </a>
                                        </div>
                                        <p className="text-center text-xs text-slate-500 mt-2 font-bold uppercase">{img.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Financial Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                            <p className="text-xs text-slate-500 uppercase">Depositado</p>
                            <p className="text-xl font-mono text-green-400">+${(stats.totalDeposited / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                            <p className="text-xs text-slate-500 uppercase">Retirado</p>
                            <p className="text-xl font-mono text-red-400">-${(stats.totalWithdrawn / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                            <p className="text-xs text-slate-500 uppercase">Apostado</p>
                            <p className="text-xl font-mono text-slate-300">{(stats.totalWagered / 100).toLocaleString()}</p>
                        </div>
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                            <p className="text-xs text-slate-500 uppercase">Ganado</p>
                            <p className="text-xl font-mono text-amber-400">+${(stats.totalWon / 100).toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Transaction History */}
                    <div className="bg-[#131b2e] border border-white/10 rounded-3xl p-6 overflow-hidden">
                        <h3 className="text-lg font-bold mb-4">📜 Historial de Transacciones (Últimos 20)</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-black/20">
                                    <tr>
                                        <th className="p-3">Fecha</th>
                                        <th className="p-3">Tipo</th>
                                        <th className="p-3">Monto</th>
                                        <th className="p-3">Razón/Meta</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {user.transactions.map((tx: any) => (
                                        <tr key={tx.id} className="hover:bg-white/5">
                                            <td className="p-3 text-slate-400 max-w-[100px] truncate" title={new Date(tx.createdAt).toLocaleString()}>
                                                {new Date(tx.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="p-3">
                                                <span className={`badge badge-xs font-mono uppercase ${['DEPOSIT', 'WIN_CREDIT', 'REFUND', 'REFERRAL_BONUS'].includes(tx.kind) ? 'badge-success' : 'badge-ghost'
                                                    }`}>
                                                    {tx.kind}
                                                </span>
                                            </td>
                                            <td className={`p-3 font-mono font-bold ${['DEPOSIT', 'WIN_CREDIT', 'REFUND', 'REFERRAL_BONUS'].includes(tx.kind) ? 'text-green-400' : 'text-slate-200'
                                                }`}>
                                                {['DEPOSIT', 'WIN_CREDIT', 'REFUND', 'REFERRAL_BONUS'].includes(tx.kind) ? '+' : '-'}${Math.abs(tx.amountCents / 100).toFixed(2)}
                                            </td>
                                            <td className="p-3 text-slate-500 truncate max-w-[200px]" title={tx.reason}>
                                                {tx.reason}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Game History */}
                    <div className="bg-[#131b2e] border border-white/10 rounded-3xl p-6 overflow-hidden">
                        <h3 className="text-lg font-bold mb-4">🎲 Historial de Juegos (Últimos 20)</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-black/20">
                                    <tr>
                                        <th className="p-3">Sala</th>
                                        <th className="p-3">Posición</th>
                                        <th className="p-3">Estado Sala</th>
                                        <th className="p-3">Fecha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {user.entries.map((entry: any) => (
                                        <tr key={entry.id} className="hover:bg-white/5">
                                            <td className="p-3 font-bold text-slate-300">
                                                {entry.room?.title || "???"}
                                                <span className="block text-[10px] bg-slate-800 rounded px-1 w-fit mt-1">{entry.room?.gameType}</span>
                                            </td>
                                            <td className="p-3 font-mono">#{entry.position}</td>
                                            <td className="p-3">
                                                <span className="badge badge-xs badge-neutral">{entry.room?.state}</span>
                                            </td>
                                            <td className="p-3 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* SECURITY & ROLE MANAGEMENT */}
                <div className="bg-[#131b2e] border border-white/10 rounded-3xl p-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">🛡️ Seguridad y Roles (Admin Zone)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Role Changer */}
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                            <p className="text-xs text-slate-500 uppercase font-bold mb-2">Rol del Usuario</p>
                            <div className="flex gap-2">
                                <select
                                    className="select select-sm select-bordered w-full bg-black/40 text-white"
                                    value={user.role}
                                    disabled={user.role === 'god'} // Cannot change specific GOD user
                                    onChange={async (e) => {
                                        if (!confirm("¿Estás seguro de cambiar el rol?")) return;
                                        try {
                                            const res = await fetch(`/api/admin/users/${id}/role`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ role: e.target.value })
                                            });
                                            const d = await res.json();
                                            if (d.error) toast.error(d.error);
                                            else {
                                                toast.success("Rol actualizado");
                                                fetchUser();
                                            }
                                        } catch (err) { toast.error("Error al cambiar rol"); }
                                    }}
                                >
                                    <option value="user">User (Jugador)</option>
                                    <option value="admin">Admin (Staff)</option>
                                    <option value="god" disabled>GOD (Intocable)</option>
                                </select>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                * Solo GOD puede nombrar otros Admins/Gods.
                            </p>
                        </div>

                        {/* Verification Reset */}
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2">
                            <p className="text-xs text-slate-500 uppercase font-bold mb-2">Resetear Verificación</p>
                            <button
                                onClick={async () => {
                                    if (!confirm("¿Solo pedir verificar otra vez? (Mantiene datos)")) return;
                                    try {
                                        const res = await fetch(`/api/admin/users/${id}/reset-verification`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ clearData: false })
                                        });
                                        if (res.ok) { toast.success("Usuario puesto en UNVERIFIED"); fetchUser(); }
                                    } catch (e) { toast.error("Error"); }
                                }}
                                className="btn btn-xs btn-warning w-full"
                            >
                                🔄 Pedir Validar (Solo Status)
                            </button>
                            <button
                                onClick={async () => {
                                    if (!confirm("🚨 ¿BORRAR fotos, documentos y pedir todo de nuevo?")) return;
                                    try {
                                        const res = await fetch(`/api/admin/users/${id}/reset-verification`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ clearData: true })
                                        });
                                        if (res.ok) { toast.success("Datos borrados y status reset"); fetchUser(); }
                                    } catch (e) { toast.error("Error"); }
                                }}
                                className="btn btn-xs btn-error btn-outline w-full"
                            >
                                🗑️ Borrar Datos y Pedir Todo
                            </button>
                        </div>

                    </div>
                </div>

            </div>
        </div>

            {/* Balance Modal */ }
    {
        balanceModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-[#1e293b] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
                    <h3 className="text-2xl font-bold mb-6">Ajustar Saldo Manual</h3>

                    <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-6">
                        <button
                            onClick={() => setBalanceAction("CREDIT")}
                            className={`flex-1 py-2 rounded-lg font-bold transition-all ${balanceAction === "CREDIT" ? "bg-green-600 text-white shadow" : "text-slate-500 hover:text-white"}`}
                        >
                            + Agregar (Credit)
                        </button>
                        <button
                            onClick={() => setBalanceAction("DEBIT")}
                            className={`flex-1 py-2 rounded-lg font-bold transition-all ${balanceAction === "DEBIT" ? "bg-red-600 text-white shadow" : "text-slate-500 hover:text-white"}`}
                        >
                            - Quitar (Debit)
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs uppercase font-bold text-slate-500">Monto (USD/COP)</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xl font-mono focus:border-primary outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs uppercase font-bold text-slate-500">Razón / Nota (Obligatorio)</label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Ej: Bono de fidelidad, Corrección de error, Depósito manual..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 h-24 resize-none focus:border-primary outline-none"
                            ></textarea>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-8">
                        <button onClick={() => setBalanceModalOpen(false)} className="flex-1 btn btn-ghost text-slate-400">Cancelar</button>
                        <button onClick={handleBalanceAdjust} className={`flex-1 btn ${balanceAction === 'CREDIT' ? 'btn-success text-white' : 'btn-error text-white'}`}>
                            Confirmar {balanceAction === 'CREDIT' ? 'Recarga' : 'Retiro'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }
        </div >
    );
}
