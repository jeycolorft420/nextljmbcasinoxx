"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pusherClient } from "@/lib/pusher-client";
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
    autoLockAt?: string; // Serialized date
};

function stateBadgeClass(s: State) {
    if (s === "OPEN") return "badge badge-success";
    if (s === "LOCKED") return "badge badge-warn";
    if (s === "FINISHED") return "badge badge-info";
    return "badge";
}

function gameBadge(gt: GameType) {
    return <span className="badge text-[10px]">{gt === "ROULETTE" ? "Ruleta" : "Dados"}</span>;
}

function Countdown({ target }: { target: string }) {
    const [left, setLeft] = useState("");

    useEffect(() => {
        const end = new Date(target).getTime();
        const interval = setInterval(() => {
            const now = Date.now();
            const diff = end - now;
            if (diff <= 0) {
                setLeft("00:00");
                return;
            }
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setLeft(`${m}:${s.toString().padStart(2, "0")}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [target]);

    return <span>{left}</span>;
}

interface RoomListProps {
    gameType: GameType;
}

export default function RoomList({ gameType }: RoomListProps) {
    const { features } = useLicense();

    // We only care about OPEN and LOCKED for the list
    const [data, setData] = useState<Room[]>([]);
    const [loading, setLoading] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});

    // --- Carga inicial por HTTP ---
    const fetchRooms = async () => {
        // Fetch OPEN and LOCKED
        const [open, locked] = await Promise.all([
            fetch(`/api/rooms?state=OPEN&gameType=${gameType}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []),
            fetch(`/api/rooms?state=LOCKED&gameType=${gameType}`, { cache: "no-store" }).then(r => r.ok ? r.json() : []),
        ]);
        return [...open, ...locked] as Room[];
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

    // --- Suscripción realtime a "public-rooms" ---
    useEffect(() => {
        load();

        const ch = pusherClient.subscribe("public-rooms");

        const onIndex = (payload: Room[]) => {
            // Filter by gameType and state (OPEN or LOCKED)
            const filtered = payload.filter(
                (r) => r.gameType === gameType && (r.state === "OPEN" || r.state === "LOCKED")
            );
            setData(filtered);
        };

        ch.bind("rooms:index", onIndex);

        return () => {
            try { ch.unbind("rooms:index", onIndex); } catch { }
            try { pusherClient.unsubscribe("public-rooms"); } catch { }
        };
    }, [gameType]);

    // Group by price
    const groupedRooms = useMemo(() => {
        const groups: Record<number, Room[]> = {};

        data.forEach(r => {
            // Double check feature flags just in case
            if (r.gameType === "ROULETTE" && !features.includes("roulette")) return;
            if (r.gameType === "DICE_DUEL" && !features.includes("dice")) return;

            if (!groups[r.priceCents]) groups[r.priceCents] = [];
            groups[r.priceCents].push(r);
        });

        return groups;
    }, [data, features]);

    const sortedPrices = useMemo(() => {
        return Object.keys(groupedRooms).map(Number).sort((a, b) => a - b);
    }, [groupedRooms]);

    const toggleGroup = (price: number) => {
        setOpenGroups(prev => ({ ...prev, [price]: !prev[price] }));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">Salas de {gameType === "DICE_DUEL" ? "Dados" : "Ruleta"}</h1>
                <div className="flex gap-2">
                    <Link href="/rooms" className="btn btn-sm btn-ghost">← Volver</Link>
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
                                                {availableCount} disponibles
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
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                            {rooms.map((r) => {
                                                const taken = r.slots?.taken ?? 0;
                                                const pct = Math.max(0, Math.min(100, (taken / r.capacity) * 100));
                                                const isFull = taken >= r.capacity;

                                                return (
                                                    <Link
                                                        key={r.id}
                                                        href={`/rooms/${r.id}`}
                                                        className={`group relative overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${isFull
                                                            ? "border-white/5 bg-white/5 opacity-60"
                                                            : "border-white/10 bg-[#131b2e] hover:border-primary/50 hover:shadow-primary/20"
                                                            }`}
                                                    >
                                                        {/* Background Gradient Effect */}
                                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                                        <div className="relative p-5 flex flex-col h-full">
                                                            {/* Header: Title & Status */}
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div>
                                                                    <h3 className="font-bold text-white text-lg group-hover:text-primary transition-colors">
                                                                        {r.gameType === "DICE_DUEL" ? "Dados" : "Ruleta"}
                                                                    </h3>
                                                                    <p className="text-xs text-slate-400 font-mono">#{r.id.slice(-4)}</p>
                                                                </div>
                                                                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${r.state === "OPEN" ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-400"
                                                                    }`}>
                                                                    {r.state === "OPEN" ? "ABIERTA" : "EN JUEGO"}
                                                                </div>
                                                            </div>

                                                            {/* Price (Centerpiece) */}
                                                            <div className="flex-1 flex flex-col items-center justify-center py-2">
                                                                <div className="text-3xl font-black text-white tracking-tight">
                                                                    ${r.priceCents / 100}
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                                                                    Entrada
                                                                </div>
                                                                {r.autoLockAt && r.state === "OPEN" && (
                                                                    <div className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full mt-2 font-mono">
                                                                        ⏳ <Countdown target={r.autoLockAt} />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Footer: Players & Action */}
                                                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                                                        <span>{taken}/{r.capacity}</span>
                                                                    </div>
                                                                    {/* Mini progress bar */}
                                                                    <div className="w-16 h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-red-500" : "bg-primary"}`}
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <button className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${isFull
                                                                    ? "bg-white/5 text-slate-500 cursor-not-allowed"
                                                                    : "bg-primary text-black hover:bg-primary-focus shadow-lg shadow-primary/20"
                                                                    }`}>
                                                                    {isFull ? "LLENA" : "JUGAR"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </Link>
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
