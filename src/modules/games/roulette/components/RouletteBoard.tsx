"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RouletteWheel from "@/modules/games/roulette/components/RouletteWheel";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

type Entry = {
    id: string;
    position: number;
    user: { id: string; name: string | null; email: string; image?: string; avatar?: string };
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
    theme?: string;
};

export default function RouletteBoard({ room, email, wheelSize, onSpinEnd, theme }: Props) {

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

    // FIX: Snapshot winner to ensure display persistence
    const [winnerSnapshot, setWinnerSnapshot] = useState<Entry | null>(null);

    const displayedWinningEntryId = revealWinner ? (winnerSnapshot?.user.id ?? room.winningEntryId ?? null) : null;

    // segmentos ruleta
    const segments = useMemo(() => {
        if (!room) return [];
        return Array.from({ length: room.capacity }).map((_, i) => {
            const entry = room.entries?.find((e) => e.position === i + 1);
            const label = entry ? (entry.user.name || entry.user.email.split("@")[0]) : `Libre #${i + 1}`;
            // Match using user.id
            const isRealWinner = !!displayedWinningEntryId && entry?.user.id === displayedWinningEntryId;
            return { label, muted: !entry, isYou: !!email && entry?.user.email === email, isWinner: isRealWinner };
        });
    }, [room, email, displayedWinningEntryId]);

    // ANIMACIÓN DE GIRO (Critical Path)
    useEffect(() => {
        if (
            (room.state === "FINISHED" || room.state === "LOCKED") &&
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
                // FIXED: Match by userId
                const winnerEntry = room.entries?.find((e) => e.user.id === winnerId);

                // Try to get position from Entry (Best case) OR from explicit Server Payload via gameMeta (Fallback)
                let finalPosition = winnerEntry ? winnerEntry.position : -1;

                if (finalPosition === -1 && (room as any).lastRoll?.winnerPosition) {
                    finalPosition = (room as any).lastRoll.winnerPosition;
                    console.log("⚠️ Using Fallback Position from Payload:", finalPosition);
                }

                if (finalPosition > 0) {
                    const idx = finalPosition - 1;
                    console.log("🎬 STARTING SPIN to index:", idx);

                    // SNAPSHOT WINNER DATA
                    if (winnerEntry) setWinnerSnapshot(winnerEntry);

                    setRevealWinner(false);
                    setSpinning(true);
                    setTargetIndex(idx);
                    setSpinKey((k) => k + 1);
                    autoSpinForWinnerRef.current = winnerId;
                } else {
                    console.error("❌ Could not determine winner position for ID:", winnerId);
                }
            }
        }

        // Reset de flags solo si está OPEN (nueva ronda) Y NO estemos girando (protección contra blip)
        if (room.state === "OPEN") {
            if (!spinningRef.current) {
                console.log("🔄 Resetting Board (State is OPEN and not spinning)");
                setRevealWinner(false);
                setWinnerSnapshot(null); // Clear snapshot
                setTargetIndex(null);
                lastWinnerRef.current = null;
                autoSpinForWinnerRef.current = null;
                if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
            } else {
                console.log("🛡️ Ignoring OPEN state reset (Spinning in progress)");
            }
        }
    }, [room.state, room.winningEntryId, room.entries]);

    const handleSpinEnd = () => {
        lastWinnerRef.current = room.winningEntryId ?? null;
        setRevealWinner(true);
        setSpinning(false);
        play("win");

        // 🎉 Efecto Confeti
        const duration = 4000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 8,
                angle: 60,
                spread: 70,
                origin: { x: 0 },
                colors: ["#22c55e", "#fbbf24", "#ffffff", "#eab308"]
            });
            confetti({
                particleCount: 8,
                angle: 120,
                spread: 70,
                origin: { x: 1 },
                colors: ["#22c55e", "#fbbf24", "#ffffff", "#eab308"]
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        })();

        if (onSpinEnd) onSpinEnd();
    };

    // Safe name extraction (Use snapshot if available)
    const winnerName = (winnerSnapshot || room.entries?.find(e => e.user.id === room.winningEntryId))?.user.name || "Jugador";
    console.log("🎲 Rendering Board:", { revealWinner, winningEntryId: room.winningEntryId, winnerName });

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[400px]">
            <RouletteWheel
                segments={segments}
                size={wheelSize}
                targetIndex={targetIndex}
                spinKey={spinKey}
                onSpinEnd={handleSpinEnd}
                theme={theme}
                soundUrl="/sfx/roulette-spin.mp3"
            />

            {/* PROFESSIONAL WINNER OVERLAY (TEXT ONLY) */}
            {revealWinner && (winnerSnapshot || room.winningEntryId) && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
                    <div className="relative animate-in zoom-in fade-in duration-500 fill-mode-forwards filter drop-shadow-2xl">

                        {/* Glow Effect Background */}
                        <div className="absolute -inset-20 bg-gradient-to-r from-yellow-500/20 via-emerald-500/20 to-yellow-500/20 blur-3xl rounded-full animate-pulse-slow"></div>

                        {/* Card Container */}
                        <div className="relative bg-gray-900/95 border-2 border-yellow-500/50 rounded-2xl p-10 flex flex-col items-center justify-center min-w-[320px] shadow-[0_0_60px_rgba(234,179,8,0.2)] backdrop-blur-xl">

                            {/* Header Badge */}
                            <div className="bg-gradient-to-r from-yellow-500 to-yellow-300 text-black font-black uppercase tracking-[0.2em] text-sm py-2 px-8 rounded-full shadow-lg border border-yellow-100 mb-6 animate-bounce-short">
                                Winner!
                            </div>

                            {/* Winner Name */}
                            <div className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400 text-center mb-4 max-w-[280px] break-words leading-tight">
                                {winnerName}
                            </div>

                            {/* Prize Amount */}
                            {room.prizeCents && (
                                <div className="flex flex-col items-center mt-2">
                                    <span className="text-emerald-400/80 text-xs font-bold uppercase tracking-widest mb-1">Premio Total</span>
                                    <span className="text-5xl font-black text-emerald-400 drop-shadow-[0_4px_8px_rgba(16,185,129,0.4)]">
                                        +${(room.prizeCents / 100).toFixed(2)}
                                    </span>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
