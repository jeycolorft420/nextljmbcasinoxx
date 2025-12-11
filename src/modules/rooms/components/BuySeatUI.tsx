"use client";

import { type Dispatch, type SetStateAction } from "react";

type Room = {
    id: string;
    priceCents: number;
    capacity: number;
    state: "OPEN" | "LOCKED" | "FINISHED" | "DRAWING";
    entries?: { position: number }[];
    gameType: "ROULETTE" | "DICE_DUEL";
};

type Props = {
    room: Room;
    qty: number;
    setQty: Dispatch<SetStateAction<number>>;
    selectedPositions: number[];
    setSelectedPositions: Dispatch<SetStateAction<number[]>>;
    joining: boolean;
    onJoin: () => void;
    className?: string;
};

export default function BuySeatUI({
    room,
    qty,
    setQty,
    selectedPositions,
    setSelectedPositions,
    joining,
    onJoin,
    className = "",
}: Props) {
    const taken = room.entries?.length ?? 0;
    const free = Math.max(0, room.capacity - taken);
    const totalUnits = selectedPositions.length > 0 ? selectedPositions.length : qty;
    const totalUSD = ((room.priceCents * totalUnits) / 100).toFixed(2);

    if (room.state !== "OPEN" || (room.entries?.length || 0) >= 2) return null;

    return (
        <div className={`mt-4 pt-4 border-t border-white/5 ${className}`}>
            <div className="grid grid-cols-3 items-center gap-2">
                {/* Selector de cantidad */}
                <div className="flex items-center border border-white/10 rounded-md overflow-hidden col-span-2">
                    <button
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 transition disabled:opacity-50"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        disabled={free === 0 || selectedPositions.length > 0}
                    >
                        −
                    </button>
                    <div className="flex-1 text-center text-sm font-medium">
                        {selectedPositions.length > 0 ? selectedPositions.length : qty} <span className="text-xs opacity-50">puest.</span>
                    </div>
                    <button
                        className="px-3 py-2 bg-white/5 hover:bg-white/10 transition disabled:opacity-50"
                        onClick={() => setQty((q) => Math.min(free, q + 1))}
                        disabled={free === 0 || selectedPositions.length > 0}
                    >
                        +
                    </button>
                </div>

                {/* Total */}
                <div className="text-right">
                    <div className="text-lg font-bold text-green-400">${totalUSD}</div>
                </div>
            </div>

            {selectedPositions.length > 0 && (
                <div className="text-xs opacity-60 mt-1 flex justify-between">
                    <span>Sel: {selectedPositions.join(", ")}</span>
                    <button className="underline hover:text-white" onClick={() => setSelectedPositions([])}>
                        Limpiar
                    </button>
                </div>
            )}

            <button
                onClick={onJoin}
                disabled={joining || free === 0}
                className="btn btn-primary btn-sm w-full mt-3 font-bold shadow-lg shadow-primary/20"
            >
                {joining ? "Procesando..." : `Comprar por $${totalUSD}`}
            </button>
        </div>
    );
}

