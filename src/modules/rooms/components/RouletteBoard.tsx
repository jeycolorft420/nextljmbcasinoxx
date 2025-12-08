"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RouletteWheel from "@/modules/rooms/components/RouletteWheel";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

type Entry = {
    id: string;
    position: number;
    user: { id: string; name: string | null; email: string };
};

type Room = {
    id: string;
    state: "OPEN" | "LOCKED" | "FINISHED";
    capacity: number;
    winningEntryId?: string | null;
    entries?: Entry[];
    gameType: "ROULETTE" | "DICE_DUEL";
    prizeCents?: number | null;
};

type Props = {
    room: Room;
    email: string | null;
    wheelSize: number;
    onSpinEnd?: () => void;
};

export default function RouletteBoard({ room, email, wheelSize, onSpinEnd }: Props) {
    const { play } = useAudio();
    // ruleta state
    const [spinKey, setSpinKey] = useState(0);
    const [targetIndex, setTargetIndex] = useState<number | null>(null);
    const [spinning, setSpinning] = useState(false);
    const [revealWinner, setRevealWinner] = useState(false);

    // refs para control de animación y reset
    const lastWinnerRef = useRef<string | null>(null);
    const autoSpinForWinnerRef = useRef<string | null>(null);
    const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const spinningRef = useRef(false);
    useEffect(() => { spinningRef.current = spinning; }, [spinning]);

    const displayedWinningEntryId = revealWinner ? room.winningEntryId ?? null : null;

    // segmentos ruleta
    const segments = useMemo(() => {
        if (!room) return [];
        return Array.from({ length: room.capacity }).map((_, i) => {
            const entry = room.entries?.find((e) => e.position === i + 1);
            const label = entry ? (entry.user.name || entry.user.email.split("@")[0]) : `Libre #${i + 1}`;
            const isRealWinner = !!displayedWinningEntryId && entry?.id === displayedWinningEntryId;
            return { label, muted: !entry, isYou: !!email && entry?.user.email === email, isWinner: isRealWinner };
        });
    }, [room, email, displayedWinningEntryId]);

    // ANIMACIÓN DE GIRO (Critical Path)
    useEffect(() => {
        if (
            room.state === "FINISHED" &&
            room.winningEntryId
        ) {
            const winnerId = room.winningEntryId as string | null;

            // Solo girar si es un NUEVO ganador que aun no hemos girado
            if (
                winnerId &&
                winnerId !== lastWinnerRef.current &&
                autoSpinForWinnerRef.current !== winnerId &&
                !spinningRef.current
            ) {
                const winnerEntry = room.entries?.find((e) => e.id === winnerId);

                // Fallback local por si el payload viene incompleto
                const fallbackEntry = !winnerEntry && room.entries
                    ? room.entries.find(e => e.id === winnerId)
                    : null;

                const finalEntry = winnerEntry || fallbackEntry;

                if (finalEntry && finalEntry.position > 0) {
                    const idx = finalEntry.position - 1;
                    console.log("🎬 STARTING SPIN to index:", idx);
                    play("spin");
                    setRevealWinner(false);
                    setSpinning(true);
                    setTargetIndex(idx);
                    setSpinKey((k) => k + 1);
                    autoSpinForWinnerRef.current = winnerId;
                }
            }
        }

        // Reset de flags si no está finished
        if (room.state !== "FINISHED") {
            setRevealWinner(false);
            setTargetIndex(null);
            lastWinnerRef.current = null;
            autoSpinForWinnerRef.current = null;
            if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
        }
    }, [room.state, room.winningEntryId, room.entries, play]);

    const handleSpinEnd = () => {
        lastWinnerRef.current = room.winningEntryId ?? null;
        setRevealWinner(true);
        setSpinning(false);
        play("win");

        // 🎉 Efecto Confeti
        const duration = 3000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ["#22c55e", "#fbbf24", "#ffffff"]
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ["#22c55e", "#fbbf24", "#ffffff"]
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        })();

        if (onSpinEnd) onSpinEnd();
    };

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[400px]">
            <RouletteWheel
                segments={segments}
                size={wheelSize}
                targetIndex={targetIndex}
                spinKey={spinKey}
                onSpinEnd={handleSpinEnd}
            />

            {/* Winner Overlay */}
            {revealWinner && room.winningEntryId && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <div className="bg-black/80 backdrop-blur-sm px-6 py-4 rounded-2xl border border-emerald-500/30 shadow-2xl animate-in zoom-in duration-300">
                        <div className="text-emerald-400 font-bold text-lg text-center mb-1">¡GANADOR!</div>
                        <div className="text-white text-2xl font-bold text-center">
                            {room.entries?.find(e => e.id === room.winningEntryId)?.user.name || "Jugador"}
                        </div>
                        {room.prizeCents && (
                            <div className="text-emerald-300 text-sm text-center mt-1 font-mono">
                                +${(room.prizeCents / 100).toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

