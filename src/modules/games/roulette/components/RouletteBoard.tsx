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

    const displayedWinningEntryId = revealWinner ? room.winningEntryId ?? null : null;
    const winnerEntry = room.entries?.find(e => e.id === room.winningEntryId);

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
                const winnerEntry = room.entries?.find((e) => e.id === winnerId);

                // Try to get position from Entry (Best case) OR from explicit Server Payload via gameMeta (Fallback)
                let finalPosition = winnerEntry ? winnerEntry.position : -1;

                if (finalPosition === -1 && (room as any).lastRoll?.winnerPosition) {
                    finalPosition = (room as any).lastRoll.winnerPosition;
                    console.log("⚠️ Using Fallback Position from Payload:", finalPosition);
                }

                if (finalPosition > 0) {
                    const idx = finalPosition - 1;
                    console.log("🎬 STARTING SPIN to index:", idx);
                    // play("spin"); // Start sound handled by RouletteWheel via soundUrl
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

    // Safe avatar extraction
    const winnerAvatar = winnerEntry?.user.image || winnerEntry?.user.avatar || "/avatars/0.png"; // Fallback default
    const winnerName = winnerEntry?.user.name || "Jugador";

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

            {/* PROFESSIONAL WINNER OVERLAY */}
            {revealWinner && room.winningEntryId && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="relative animate-in zoom-in fade-in duration-500 fill-mode-forwards filter drop-shadow-2xl">

                        {/* Glow Effect Background */}
                        <div className="absolute -inset-10 bg-gradient-to-r from-yellow-500/30 via-emerald-500/30 to-yellow-500/30 blur-3xl rounded-full animate-pulse-slow"></div>

                        {/* Card Container */}
                        <div className="relative bg-gray-900/95 border border-yellow-500/50 rounded-xl p-8 flex flex-col items-center justify-center min-w-[280px] shadow-[0_0_50px_rgba(234,179,8,0.3)] backdrop-blur-xl">

                            {/* Header Badge */}
                            <div className="absolute -top-5 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black font-black uppercase tracking-widest text-xs py-1.5 px-6 rounded-full shadow-lg border border-yellow-200">
                                Winner!
                            </div>

                            {/* Avatar Ring */}
                            <div className="relative mb-4 mt-2">
                                <div className="absolute -inset-1 bg-gradient-to-tr from-yellow-400 to-emerald-500 rounded-full animate-spin-slow opacity-75 blur-sm"></div>
                                <img
                                    src={winnerAvatar}
                                    alt="Winner"
                                    className="relative w-24 h-24 rounded-full border-4 border-gray-900 object-cover bg-gray-800"
                                />
                                <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-black text-xs font-bold w-8 h-8 flex items-center justify-center rounded-full border-2 border-gray-900">
                                    #1
                                </div>
                            </div>

                            {/* Winner Name */}
                            <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300 text-center mb-1 max-w-[200px] truncate">
                                {winnerName}
                            </div>

                            {/* Prize Amount */}
                            {room.prizeCents && (
                                <div className="flex flex-col items-center mt-2 animate-bounce-short">
                                    <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Has ganado</span>
                                    <span className="text-4xl font-black text-emerald-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
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
                const winnerEntry = room.entries?.find((e) => e.id === winnerId);

                // Try to get position from Entry (Best case) OR from explicit Server Payload via gameMeta (Fallback)
                let finalPosition = winnerEntry ? winnerEntry.position : -1;

                if (finalPosition === -1 && (room as any).lastRoll?.winnerPosition) {
                    finalPosition = (room as any).lastRoll.winnerPosition;
                    console.log("⚠️ Using Fallback Position from Payload:", finalPosition);
                }

                if (finalPosition > 0) {
                    const idx = finalPosition - 1;
                    console.log("🎬 STARTING SPIN to index:", idx);
                    play("spin");
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
                setTargetIndex(null);
                lastWinnerRef.current = null;
                autoSpinForWinnerRef.current = null;
                if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
            } else {
                console.log("🛡️ Ignoring OPEN state reset (Spinning in progress)");
            }
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
                theme={theme}
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


