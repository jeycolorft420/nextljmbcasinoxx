"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils"; // Assuming this exists, otherwise I'll mock it

type HistoryItem = {
    id: string;
    roomId: string;
    roomTitle: string;
    gameType: "ROULETTE" | "DICE_DUEL";
    priceCents: number;
    status: "PENDING" | "PLAYING" | "WON" | "LOST";
    prizeCents: number;
    createdAt: string;
    position: number;
};

type TransactionItem = {
    id: string;
    amountCents: number;
    kind: string; // DEPOSIT, WITHDRAW, etc.
    reason: string;
    createdAt: string;
};

export default function HistoryPage() {
    const [tab, setTab] = useState<"GAMES" | "TRANSACTIONS">("GAMES");

    // Games
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loadingGames, setLoadingGames] = useState(true);

    // Transactions
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [loadingTx, setLoadingTx] = useState(true);

    useEffect(() => {
        // Load Games
        fetch("/api/me/history").then(r => r.json()).then(d => {
            if (Array.isArray(d)) setHistory(d);
        }).finally(() => setLoadingGames(false));

        // Load Transactions
        fetch("/api/me/transactions").then(r => r.json()).then(d => {
            if (Array.isArray(d)) setTransactions(d);
        }).finally(() => setLoadingTx(false));
    }, []);

    const formatDate = (d: string) => new Date(d).toLocaleString();

    return (
        <main className="max-w-4xl mx-auto p-4 space-y-6">
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Historial de Actividad</h1>
                    <p className="text-slate-400 text-sm">Tus juegos y movimientos de saldo</p>
                </div>
                <Link href="/dashboard" className="btn btn-ghost text-sm">
                    ← Volver al Dashboard
                </Link>
            </header>

            {/* Tabs */}
            <div className="flex bg-slate-900 p-1 rounded-lg w-fit border border-white/10">
                <button
                    onClick={() => setTab("GAMES")}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === "GAMES" ? "bg-primary text-black shadow-lg" : "text-slate-400 hover:text-white"}`}
                >
                    🎲 Partidas
                </button>
                <button
                    onClick={() => setTab("TRANSACTIONS")}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === "TRANSACTIONS" ? "bg-primary text-black shadow-lg" : "text-slate-400 hover:text-white"}`}
                >
                    💳 Transacciones
                </button>
            </div>

            {/* Content */}
            {tab === "GAMES" ? (
                // Games List
                loadingGames ? (
                    <div className="text-center py-10 opacity-50">Cargando partidas...</div>
                ) : history.length === 0 ? (
                    <div className="text-center py-12 opacity-60 border border-dashed border-white/10 rounded-xl">
                        <p>No has jugado ninguna partida aún.</p>
                        <Link href="/rooms" className="btn btn-primary mt-4">Ir a las Salas</Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {history.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-[#131b2e] border border-white/10 rounded-xl hover:bg-white/5 transition">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${item.gameType === "DICE_DUEL" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                                        {item.gameType === "DICE_DUEL" ? "🎲" : "🎡"}
                                    </div>
                                    <div>
                                        <div className="font-bold">{item.roomTitle}</div>
                                        <div className="text-xs opacity-60">{formatDate(item.createdAt)} · Puesto #{item.position}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`font-bold ${item.status === "WON" ? "text-green-400" : item.status === "LOST" ? "text-red-400" : "text-yellow-400"}`}>
                                        {item.status === "WON" ? `+$${(item.prizeCents / 100).toFixed(2)}` : `-$${(item.priceCents / 100).toFixed(2)}`}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-wider opacity-70">
                                        {item.status === "WON" ? "GANASTE" : item.status === "LOST" ? "PERDISTE" : item.status}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                // Transactions List
                loadingTx ? (
                    <div className="text-center py-10 opacity-50">Cargando transacciones...</div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-12 opacity-60 border border-dashed border-white/10 rounded-xl">
                        <p>No hay movimientos en tu cuenta.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {transactions.map((tx) => {
                            const isPositive = ["DEPOSIT", "WIN_CREDIT", "REFUND", "REFERRAL_BONUS", "TRANSFER_IN"].includes(tx.kind);
                            return (
                                <div key={tx.id} className="flex items-center justify-between p-4 bg-[#131b2e] border border-white/10 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isPositive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                            {isPositive ? "↓" : "↑"}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm">{tx.reason || tx.kind}</div>
                                            <div className="text-xs opacity-60">{formatDate(tx.createdAt)}</div>
                                        </div>
                                    </div>
                                    <div className={`font-bold font-mono ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                                        {isPositive ? "+" : "-"}${Math.abs(tx.amountCents / 100).toFixed(2)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </main>
    );
}
