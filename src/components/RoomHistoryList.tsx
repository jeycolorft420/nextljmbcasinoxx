"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

type GameResult = {
    id: string;
    winnerName: string | null;
    prizeCents: number;
    createdAt: string;
    roundNumber: number;
};

export default function RoomHistoryList({ roomId, reloadKey }: { roomId: string; reloadKey: number }) {
    const [history, setHistory] = useState<GameResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/rooms/${roomId}/history`)
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setHistory(data);
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, [roomId, reloadKey]);

    if (loading && history.length === 0) return <div className="text-xs opacity-50">Cargando historial...</div>;
    if (history.length === 0) return null;

    return (
        <div className="card p-3 space-y-2">
            <h3 className="text-xs font-bold uppercase opacity-70 mb-2">Historial de Ganadores</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {history.map((r) => (
                    <div key={r.id} className="flex justify-between items-center text-xs bg-white/5 p-1.5 rounded">
                        <div className="flex flex-col">
                            <span className="font-medium text-green-400">{r.winnerName || "Anónimo"}</span>
                            <span className="text-[10px] opacity-50">
                                {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: es })}
                            </span>
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-yellow-500">+${r.prizeCents / 100}</div>
                            <div className="text-[9px] opacity-40">Ronda {r.roundNumber}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
