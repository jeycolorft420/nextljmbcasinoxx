"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function HistoryPage() {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/me/history")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setHistory(data);
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <main className="max-w-4xl mx-auto p-4 text-center">
                <div className="opacity-70">Cargando historial...</div>
            </main>
        );
    }

    return (
        <main className="max-w-4xl mx-auto p-4 space-y-6">
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Historial de Juegos</h1>
                <Link href="/dashboard" className="btn btn-ghost text-sm">
                    ← Volver al Dashboard
                </Link>
            </header>

            {history.length === 0 ? (
                <div className="text-center py-12 opacity-60 border border-dashed border-white/10 rounded-xl">
                    <p>No has jugado ninguna partida aún.</p>
                    <Link href="/rooms" className="btn btn-primary mt-4">
                        Ir a las Salas
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {history.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition"
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold
                  ${item.gameType === "DICE_DUEL"
                                            ? "bg-blue-500/20 text-blue-400"
                                            : "bg-purple-500/20 text-purple-400"
                                        }`}
                                >
                                    {item.gameType === "DICE_DUEL" ? "🎲" : "🎡"}
                                </div>
                                <div>
                                    <div className="font-bold">{item.roomTitle}</div>
                                    <div className="text-xs opacity-60">
                                        {new Date(item.createdAt).toLocaleString()} · Puesto #{item.position}
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div
                                    className={`font-bold ${item.status === "WON"
                                            ? "text-green-400"
                                            : item.status === "LOST"
                                                ? "text-red-400"
                                                : "text-yellow-400"
                                        }`}
                                >
                                    {item.status === "WON"
                                        ? `+$${(item.prizeCents / 100).toFixed(2)}`
                                        : `-$${(item.priceCents / 100).toFixed(2)}`}
                                </div>
                                <div className="text-[10px] uppercase tracking-wider opacity-70">
                                    {item.status === "WON" ? "GANASTE" : item.status === "LOST" ? "PERDISTE" : item.status}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
