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
    // refs para control de animación y reset
    const lastWinnerRef = useRef<string | null>(null);
    const autoSpinForWinnerRef = useRef<string | null>(null);
    const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const spinningRef = useRef(false);
    // Sound guard
    const hasPlayedWinSoundRef = useRef(false);

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
                    hasPlayedWinSoundRef.current = false; // Reset sound guard
                    setSpinning(true);
                    setTargetIndex(idx);
                    setSpinKey((k) => k + 1);
                    autoSpinForWinnerRef.current = winnerId;
                } else {
                    console.error("❌ Could not determine winner position for ID:", winnerId);
                }
            }
        }

        // Reset de flags si está OPEN o WAITING (nueva ronda) Y NO estemos girando (protección contra blip)
        if (room.state === "OPEN" || room.state === "WAITING") {
            if (!spinningRef.current) {
                console.log("🔄 Resetting Board (State is OPEN/WAITING and not spinning)");
                setRevealWinner(false);
                setWinnerSnapshot(null); // Clear snapshot
                setTargetIndex(null);
                lastWinnerRef.current = null;
                autoSpinForWinnerRef.current = null;
                hasPlayedWinSoundRef.current = false;
                if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
            } else {
                console.log("🛡️ Ignoring reset (Spinning in progress)");
            }
        }
    }, [room.state, room.winningEntryId, room.entries]);

    const handleSpinEnd = () => {
        lastWinnerRef.current = room.winningEntryId ?? null;
        setRevealWinner(true);
        setSpinning(false);

        if (!hasPlayedWinSoundRef.current) {
            play("win");
            hasPlayedWinSoundRef.current = true;
        }

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

    // Prize Calculation with Fallback (10x logic)
    const rawPrize = room.prizeCents || ((room.priceCents || 0) * 10);
    const winnerAmount = (rawPrize / 100).toFixed(2);

    const isMe = email && (winnerSnapshot?.user.email === email || room.winningEntryId && room.entries?.find(e => e.user.id === room.winningEntryId)?.user.email === email);


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

            {/* UPGRADED WINNER OVERLAY */}
            {revealWinner && (winnerSnapshot || room.winningEntryId) && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 p-4 animate-in fade-in">
                    <div className="flex flex-col items-center justify-center animate-in zoom-in duration-300 text-center bg-[#0a0a0a] p-8 rounded-[40px] border border-white/10 shadow-2xl relative overflow-hidden min-w-[320px]">

                        {/* Background Splatter/Glow */}
                        <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${isMe ? "from-emerald-500 via-emerald-900 to-transparent" : "from-amber-500 via-amber-900 to-transparent"}`}></div>

                        <div className="text-6xl md:text-7xl mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] animate-bounce-short">
                            {isMe ? "🏆" : "👑"}
                        </div>

                        <div className={`text-3xl md:text-4xl font-black uppercase mb-1 tracking-tight ${isMe ? 'text-transparent bg-clip-text bg-gradient-to-b from-emerald-300 to-emerald-600' : 'text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-500'}`}>
                            {isMe ? "¡VICTORIA!" : winnerName}
                        </div>

                        {!isMe && <div className="text-xs uppercase tracking-[0.3em] text-white/40 font-bold mb-4">GANADOR</div>}

                        {/* Amount Won */}
                        <div className="flex flex-col items-center bg-white/5 rounded-3xl px-8 py-4 border border-white/5 backdrop-blur-md mt-2 shadow-inner">
                            <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest mb-1">PREMIO TOTAL</span>
                            <span className={`text-4xl font-mono font-black ${isMe ? "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" : "text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]"}`}>
                                +${winnerAmount}
                            </span>
                        </div>

                        {/* Round Info */}
                        <div className="mt-6 flex gap-2">
                            <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5">
                                <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">
                                    ROULETTE
                                </span>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
