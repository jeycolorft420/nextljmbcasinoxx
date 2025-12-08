"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pusherClient } from "@/modules/ui/lib/pusher-client";
import { useLicense } from "@/context/LicenseContext";

type State = "OPEN" | "LOCKED" | "FINISHED";
type GameType = "ROULETTE" | "DICE_DUEL";
type Room = {
    id: string;
    title: string;
    priceCents: number;
    state: State;
    capacity: number;
    gameType: GameType;
    slots?: { taken: number; free: number };
    winner?: any;
    winnerName?: string;
    winnerPosition?: number;
    prizeCents?: number;
};

interface AdminRoomListProps {
    gameType: GameType;
}

export default function AdminRoomList({ gameType }: AdminRoomListProps) {
    const { features } = useLicense();

    const [data, setData] = useState<Room[]>([]);
    const [loading, setLoading] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});

    // Admin Action States
    const [finishingId, setFinishingId] = useState<string | null>(null);
    const [presetId, setPresetId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // --- Carga inicial por HTTP ---
    const fetchRooms = async () => {
        // Fetch OPEN, LOCKED, and FINISHED
        const [open, locked, finished] = await Promise.all([
            fetch(`/api/rooms?state=OPEN&gameType=${gameType}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []),
            fetch(`/api/rooms?state=LOCKED&gameType=${gameType}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []),
            fetch(`/api/rooms?state=FINISHED&gameType=${gameType}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []),
        ]);
        return [...open, ...locked, ...finished] as Room[];
    };

    const load = async () => {
        try {
            setLoading(true);
            const rooms = await fetchRooms();
            setData(rooms);
        } finally {
            setLoading(false);
        }
    };

    // --- Suscripción realtime a "private-rooms" (Admin channel) ---
    useEffect(() => {
        load();

        const ch = pusherClient.subscribe("private-rooms");

        const onIndex = (payload: Room[]) => {
            // Filter by gameType
            const filtered = payload.filter((r) => r.gameType === gameType);
            setData(filtered);
        };

        ch.bind("rooms:index", onIndex);

        return () => {
            try { ch.unbind("rooms:index", onIndex); } catch { }
            try { pusherClient.unsubscribe("private-rooms"); } catch { }
        };
    }, [gameType]);

    // Group by price
    const groupedRooms = useMemo(() => {
        const groups: Record<number, Room[]> = {};

        data.forEach(r => {
            if (!groups[r.priceCents]) groups[r.priceCents] = [];
            groups[r.priceCents].push(r);
        });

        return groups;
    }, [data]);

    const sortedPrices = useMemo(() => {
        return Object.keys(groupedRooms).map(Number).sort((a, b) => a - b);
    }, [groupedRooms]);

    const toggleGroup = (price: number) => {
        setOpenGroups(prev => ({ ...prev, [price]: !prev[price] }));
    };

    // --- Admin Actions ---
    const fill = async (id: string, count?: number) => {
        const r = await fetch(`/api/rooms/${id}/fill`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(count ? { count } : {}),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return alert(d.error || "No se pudo llenar");
    };

    const reset = async (id: string) => {
        if (!confirm("¿Seguro que quieres vaciar la sala y reabrirla?")) return;
        const r = await fetch(`/api/rooms/${id}/reset`, { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return alert(d.error || "No se pudo resetear");
    };

    const finish = async (id: string) => {
        if (finishingId) return;
        setFinishingId(id);
        try {
            const r = await fetch(`/api/rooms/${id}/finish`, { method: "POST" });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) return alert(d.error || `Error ${r.status}`);

            const name = d.winnerName ?? d.winner?.name ?? d.winner?.user?.name ?? d.winner?.email ?? "desconocido";
            const pos = d.winnerPosition ?? d.winner?.position ?? "-";

            alert(`Ganador: ${name} · Puesto #${pos} · Premio: $${(d.prizeCents ?? 0) / 100}`);
        } finally {
            setFinishingId(null);
        }
    };

    const presetWinner = async (id: string) => {
        const raw = window.prompt("Posición preseleccionada (1..12):");
        if (!raw) return;
        const pos = parseInt(raw, 10);
        if (!Number.isInteger(pos) || pos < 1 || pos > 12) {
            alert("Posición inválida");
            return;
        }
        setPresetId(id);
        try {
            const r = await fetch(`/api/rooms/${id}/preset-winner`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ position: pos }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) return alert(d.error || `Error ${r.status}`);
            alert(`Preseleccionado puesto #${pos} para el próximo sorteo.`);
        } finally {
            setPresetId(null);
        }
    };

    const removeRoom = async (id: string, taken: number, state: State) => {
        if (state === "LOCKED" && taken > 0) {
            alert("Sala LOCKED con participantes. Ejecuta 'Reset' antes de eliminar.");
            return;
        }
        if (!confirm("¿Eliminar esta sala? Se ocultará de todos los listados.")) return;

        setDeletingId(id);
        try {
            const r = await fetch(`/api/rooms/${id}/delete`, { method: "DELETE" });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) return alert(d.error || `Error ${r.status}`);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">Admin: Salas de {gameType === "DICE_DUEL" ? "Dados" : "Ruleta"}</h1>
                <div className="flex gap-2">
                    <Link href="/admin/rooms" className="btn btn-sm btn-ghost">← Volver</Link>
                    <button onClick={load} className="btn btn-sm" title="Refrescar">
                        ⟳<span className="hidden sm:inline"> Refrescar</span>
                    </button>
                </div>
            </div>

            {loading && data.length === 0 ? (
                <p className="opacity-80 text-center py-10">Cargando salas...</p>
            ) : sortedPrices.length === 0 ? (
                <div className="card text-center py-10 border border-white/10">
                    <div className="text-sm opacity-80">No hay salas disponibles en este momento.</div>
                </div>
            ) : (
                <div className="space-y-4">
                    {sortedPrices.map(price => {
                        const rooms = groupedRooms[price];
                        const isOpen = openGroups[price];
                        const availableCount = rooms.filter(r => r.state === "OPEN").length;

                        return (
                            <div key={price} className="border border-white/10 rounded-xl overflow-hidden bg-[#0f172a]">
                                <button
                                    onClick={() => toggleGroup(price)}
                                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                                            ${price / 100}
                                        </div>
                                        <span className="font-bold text-lg">Salas de ${price / 100}</span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-end">
                                            <span className="text-sm font-medium text-white">
                                                {availableCount} abiertas
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {rooms.length} total
                                            </span>
                                        </div>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                        >
                                            <path d="m6 9 6 6 6-6" />
                                        </svg>
                                    </div>
                                </button>

                                {isOpen && (
                                    <div className="p-4 bg-black/20 border-t border-white/10">
                                        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                                            {rooms.map((r) => {
                                                const taken = r.slots?.taken ?? 0;
                                                const pct = Math.max(0, Math.min(100, (taken / r.capacity) * 100));
                                                const isFull = taken >= r.capacity;
                                                const free = r.capacity - taken;
                                                const disablingDelete = r.state === "LOCKED" && taken > 0;

                                                return (
                                                    <div
                                                        key={r.id}
                                                        className={`group relative overflow-hidden rounded-xl border transition-all duration-300 ${isFull
                                                            ? "border-white/5 bg-white/5"
                                                            : "border-white/10 bg-[#131b2e]"
                                                            }`}
                                                    >
                                                        <div className="p-4 flex flex-col h-full gap-3">
                                                            {/* Header */}
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h3 className="font-bold text-white text-base">
                                                                        {r.title}
                                                                    </h3>
                                                                    <p className="text-xs text-slate-400 font-mono">ID: {r.id.slice(-4)}</p>
                                                                </div>
                                                                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${r.state === "OPEN" ? "bg-emerald-500/20 text-emerald-400" :
                                                                    r.state === "LOCKED" ? "bg-yellow-500/20 text-yellow-400" :
                                                                        "bg-blue-500/20 text-blue-400"
                                                                    }`}>
                                                                    {r.state}
                                                                </div>
                                                            </div>

                                                            {/* Progress */}
                                                            <div className="space-y-1">
                                                                <div className="flex justify-between text-xs text-slate-400">
                                                                    <span>Ocupación</span>
                                                                    <span>{taken}/{r.capacity}</span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-red-500" : "bg-primary"}`}
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Admin Controls */}
                                                            <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-white/5">
                                                                <Link href={`/rooms/${r.id}`} className="btn btn-xs btn-ghost w-full">Ver Sala</Link>

                                                                {r.state !== "FINISHED" && (
                                                                    <>
                                                                        <button onClick={() => fill(r.id, 1)} className="btn btn-xs w-full">Llenar +1</button>
                                                                        <button onClick={() => fill(r.id, 3)} className="btn btn-xs w-full">Llenar +3</button>
                                                                        {free > 0 && <button onClick={() => fill(r.id)} className="btn btn-xs w-full">Llenar Todo</button>}

                                                                        {r.gameType === "ROULETTE" && (
                                                                            <button
                                                                                onClick={() => presetWinner(r.id)}
                                                                                disabled={presetId === r.id}
                                                                                className="btn btn-xs w-full disabled:opacity-50"
                                                                            >
                                                                                Trucar
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}

                                                                <button onClick={() => reset(r.id)} className="btn btn-xs w-full">Reset</button>

                                                                {r.state === "LOCKED" && (
                                                                    <button
                                                                        onClick={() => finish(r.id)}
                                                                        disabled={finishingId === r.id}
                                                                        className="btn btn-xs btn-primary w-full disabled:opacity-50 col-span-2"
                                                                    >
                                                                        {finishingId === r.id ? "Sorteando..." : "FORZAR SORTEO"}
                                                                    </button>
                                                                )}

                                                                <button
                                                                    onClick={() => removeRoom(r.id, taken, r.state)}
                                                                    disabled={deletingId === r.id || disablingDelete}
                                                                    className="btn btn-xs btn-danger w-full col-span-2 disabled:opacity-50"
                                                                >
                                                                    {deletingId === r.id ? "Eliminando..." : "Eliminar Sala"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

