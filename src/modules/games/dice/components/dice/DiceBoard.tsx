// src/components/dice/DiceBoard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import DiceDuel from "@/modules/games/dice/components/DiceDuel";
import { type DiceSkin } from "./ThreeDDice";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

type Entry = {
  id: string;
  position: number;
  user: { id: string; name: string | null; email: string; selectedDiceColor?: string | null };
};

type Room = {
  id: string;
  title: string;
  priceCents: number;
  state: "OPEN" | "LOCKED" | "FINISHED" | "DRAWING";
  capacity: number;
  prizeCents?: number | null;
  winningEntryId?: string | null;
  entries?: Entry[];
  gameMeta?: any | null;
  currentRound?: number;
};

// ----------------- NUEVO: Historial exportable -----------------
export function DiceHistory({
  room,
  className = "",
  maxHeight = 220,
  swapVisuals = false,
}: {
  room: Room;
  className?: string;
  maxHeight?: number;
  swapVisuals?: boolean;
}) {
  const topEntry = room.entries?.find(e => e.position === 1);
  const bottomEntry = room.entries?.find(e => e.position === 2);
  const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;

  if (!room.gameMeta?.history?.length) return null;

  return (
    <div className={`w-full max-w-md bg-black/30 border border-white/10 rounded-xl p-3 ${className}`}>
      <h3 className="font-semibold mb-2 text-center text-sm">Historial de Rondas</h3>
      <div className="space-y-1" style={{ maxHeight, overflowY: "auto" }}>
        {[...room.gameMeta.history].reverse().map((r: any, i: number) => {
          const winner =
            r.winnerName ||
            room.entries?.find((e) => e.id === r.winnerEntryId)?.user?.name ||
            room.entries?.find((e) => e.id === r.winnerEntryId)?.user?.email ||
            (r.winnerEntryId === null ? "Empate" : "Desconocido");

          const topBal = fmtUSD(r.balancesAfter?.[topEntry?.user.id ?? ""] ?? room.priceCents);
          const bottomBal = fmtUSD(r.balancesAfter?.[bottomEntry?.user.id ?? ""] ?? room.priceCents);

          // SWAP LOGIC
          const d = r.dice || {};
          const showD1 = swapVisuals ? d.bottom : d.top;
          const showD2 = swapVisuals ? d.top : d.bottom;
          const showB1 = swapVisuals ? bottomBal : topBal;
          const showB2 = swapVisuals ? topBal : bottomBal;

          return (
            <div
              key={i}
              className="flex justify-between items-center bg-black/40 rounded-lg px-3 py-1 text-xs hover:bg-white/10 transition"
            >
              <span className="font-medium text-white">
                Ronda {r.round} · <span className="text-[#109e28]">{winner === "Empate" ? "Empate" : `Ganó ${winner}`}</span>
                {r.timeoutForfeiterUserId && <span className="opacity-70"> (por tiempo)</span>}
              </span>
              <span className="opacity-80">
                {r.dice ? `(${showD1?.join(", ")} vs ${showD2?.join(", ")})` : "—"}
              </span>
              <span className="opacity-70 whitespace-nowrap">
                {showB1} / {showB2}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// ----------------------------------------------------------------

type Props = {
  room: Room;
  email: string | null;
  onReroll: () => Promise<void>;
  onForfeit: () => Promise<void>;
  onLeave: () => Promise<void>;
  onRejoin: () => Promise<void>;
  onOpenHistory?: () => void;
  onAfterAnim?: () => void;
  wheelSize: number;
};

const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;

// map a DiceSkin
function toSkin(s?: string | null): DiceSkin {
  const allowed: DiceSkin[] = ["white", "green", "blue", "yellow", "red", "purple"];
  return (s && (allowed as readonly string[]).includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({
  room,
  email,
  onReroll,
  onForfeit,
  onLeave,
  onRejoin,
  onOpenHistory,
  onAfterAnim,
  wheelSize,
}: Props) {
  const { play } = useAudio();
  const topEntry = room.entries?.find(e => e.position === 1);
  const bottomEntry = room.entries?.find(e => e.position === 2);
  const meEntry = room.entries?.find((e) => e.user.email === email) ?? null;

  // Turn Logic
  const rolls = room.gameMeta?.rolls || {};
  const lastDice = room.gameMeta?.lastDice || {};

  // Visual Dice (Active OR Last)
  const currentTopRoll = topEntry ? (rolls[topEntry.user.id] || lastDice.top || null) : null;
  const currentBottomRoll = bottomEntry ? (rolls[bottomEntry.user.id] || lastDice.bottom || null) : null;

  // Persist rolls (Visual Memory) - Keep last valid roll visible
  const [displayedTopRoll, setDisplayedTopRoll] = useState<[number, number] | null>(null);
  const [displayedBottomRoll, setDisplayedBottomRoll] = useState<[number, number] | null>(null);

  // Animation States
  const [animatingTop, setAnimatingTop] = useState(false);
  const [animatingBottom, setAnimatingBottom] = useState(false);

  // Winner Display State (3s)
  const [winnerDisplay, setWinnerDisplay] = useState<{ name: string; amount: string } | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (room.state === "FINISHED") {
      const t = setTimeout(() => setShowOverlay(true), 3000);
      return () => clearTimeout(t);
    } else {
      setShowOverlay(false);
    }
  }, [room.state]);

  const lastHistoryLen = useRef(room.gameMeta?.history?.length || 0);

  useEffect(() => {
    const currentLen = room.gameMeta?.history?.length || 0;
    if (currentLen > lastHistoryLen.current) {
      // New Round Finished!
      const lastRound = room.gameMeta.history[currentLen - 1];
      const winnerName =
        room.entries?.find((e) => e.id === lastRound.winnerEntryId)?.user?.name || "Jugador";

      // Calculate amount won (from history)
      const damage = lastRound.damage ?? 0;

      setWinnerDisplay({
        name: winnerName,
        amount: fmtUSD(damage)
      });

      // Clear after 3s
      const t = setTimeout(() => setWinnerDisplay(null), 3000);
      lastHistoryLen.current = currentLen;
      return () => clearTimeout(t);
    }
    lastHistoryLen.current = currentLen;
  }, [room.gameMeta?.history]);

  // Helper to compare rolls
  const isDiff = (a: [number, number] | null, b: [number, number] | null) => {
    if (!a && !b) return false;
    if (!a || !b) return true;
    return a[0] !== b[0] || a[1] !== b[1];
  };

  useEffect(() => {
    if (currentTopRoll) {
      if (isDiff(currentTopRoll, displayedTopRoll)) {
        setAnimatingTop(true);
        const t = setTimeout(() => {
          setAnimatingTop(false);
          setDisplayedTopRoll(currentTopRoll);
        }, 800);
        return () => clearTimeout(t);
      }
    }
  }, [currentTopRoll]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentBottomRoll) {
      if (isDiff(currentBottomRoll, displayedBottomRoll)) {
        setAnimatingBottom(true);
        const t = setTimeout(() => {
          setAnimatingBottom(false);
          setDisplayedBottomRoll(currentBottomRoll);
        }, 800);
        return () => clearTimeout(t);
      }
    }
  }, [currentBottomRoll]); // eslint-disable-line react-hooks/exhaustive-deps

  const amTop = meEntry?.position === 1;
  const amBottom = meEntry?.position === 2;

  // Determine Turn (Logic State - ONLY active rolls)
  const hasRolledTop = topEntry && !!rolls[topEntry.user.id];
  const hasRolledBottom = bottomEntry && !!rolls[bottomEntry.user.id];

  // Ghost State (Visual is showing something, but Logic says no roll)
  const isGhostTop = !hasRolledTop && !!lastDice.top;
  const isGhostBottom = !hasRolledBottom && !!lastDice.bottom;

  // P1 goes first.
  let myTurn = false;
  let statusText = "";

  if (room.state === "FINISHED") {
    statusText = "Juego Terminado";
  } else if (!topEntry || !bottomEntry) {
    statusText = "Esperando jugadores...";
  } else {
    if (!hasRolledTop) {
      // Waiting for Top
      if (amTop) {
        myTurn = true;
        statusText = "Tu turno (Jugador 1)";
      } else {
        statusText = `Esperando a ${topEntry.user.name || "Jugador 1"}...`;
      }
    } else if (!hasRolledBottom) {
      // Waiting for Bottom
      if (amBottom) {
        myTurn = true;
        statusText = "Tu turno (Jugador 2)";
      } else {
        statusText = `Esperando a ${bottomEntry.user.name || "Jugador 2"}...`;
      }
    } else {
      statusText = "Calculando ganador...";
    }
  }

  const [rolling, setRolling] = useState(false);
  const [rolledThisRound, setRolledThisRound] = useState(false);

  // Reset rolled state on new round
  useEffect(() => {
    setRolledThisRound(false);
  }, [room.currentRound]);

  const handleRoll = async () => {
    if (rolling || rolledThisRound) return;
    setRolling(true);
    setRolledThisRound(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/roll`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Error al tirar");
        setRolledThisRound(false);
      }
    } catch (e) {
      toast.error("Error de conexión");
      setRolledThisRound(false);
    } finally {
      setRolling(false);
    }
  };

  const handleTimeout = async () => {
    if (rolling || rolledThisRound) return;
    setRolling(true);
    setRolledThisRound(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/timeout`, { method: "POST" });
      if (!res.ok) {
        console.error("Timeout API failed");
      }
    } catch (e) {
      console.error("Timeout error", e);
    } finally {
      setRolling(false);
    }
  };

  // Sound & Animation Triggers
  const lastTopRoll = useRef<string>("");
  const lastBottomRoll = useRef<string>("");

  useEffect(() => {
    const tStr = JSON.stringify(currentTopRoll);
    const bStr = JSON.stringify(currentBottomRoll);

    if (tStr !== lastTopRoll.current && currentTopRoll) {
      play("roll");
      lastTopRoll.current = tStr;
    }
    if (bStr !== lastBottomRoll.current && currentBottomRoll) {
      play("roll");
      lastBottomRoll.current = bStr;
    }
  }, [currentTopRoll, currentBottomRoll, play]);

  // Winner Sound
  useEffect(() => {
    if (room.state === "FINISHED" && room.winningEntryId === meEntry?.id) {
      play("win");
    }
  }, [room.state, room.winningEntryId, meEntry?.id, play]);

  // Confetti on Finish
  useEffect(() => {
    if (room.state === "FINISHED") {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10b981", "#fbbf24", "#ffffff"]
      });
    }
  }, [room.state]);


  // Labels
  const topLabel = (topEntry?.user.name || "Jugador 1") + (amTop ? " (Tú)" : "");
  const bottomLabel = (bottomEntry?.user.name || "Jugador 2") + (amBottom ? " (Tú)" : "");

  // Skins
  const topSkin: DiceSkin = toSkin(topEntry?.user.selectedDiceColor);
  const bottomSkin: DiceSkin = toSkin(bottomEntry?.user.selectedDiceColor);

  // Balances
  const topBalance = room.gameMeta?.balances?.[topEntry?.user.id || ""] ?? room.priceCents;
  const bottomBalance = room.gameMeta?.balances?.[bottomEntry?.user.id || ""] ?? room.priceCents;

  // VISUAL SWAP: If I am Top (P1), I want to see myself at Bottom.
  const swapVisuals = amTop;

  const realTopRolling = (amTop && rolling) || animatingTop;
  const realBottomRolling = (amBottom && rolling) || animatingBottom;

  // Timer Logic
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (myTurn && !rolledThisRound && !rolling) {
      // 1. Check localStorage for existing start time
      const storageKey = `dice_timer_${room.id}_${room.currentRound}_${meEntry?.id}`;
      const storedStart = localStorage.getItem(storageKey);
      let startTime = Date.now();

      if (storedStart) {
        startTime = parseInt(storedStart, 10);
      } else {
        localStorage.setItem(storageKey, startTime.toString());
      }

      // 2. Calculate remaining time
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);

      // 3. Start interval
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            // Silent timeout (loss of round)
            handleTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(30);
      // Clear storage if turn ended
      if (!myTurn && meEntry?.id) {
        const storageKey = `dice_timer_${room.id}_${room.currentRound}_${meEntry.id}`;
        localStorage.removeItem(storageKey);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [myTurn, rolledThisRound, rolling, room.currentRound, room.id, meEntry?.id]);

  // Auto-Leave Timer (30s)
  useEffect(() => {
    if (room.state === "FINISHED" && meEntry) {
      const t = setTimeout(() => {
        onLeave();
      }, 30000);
      return () => clearTimeout(t);
    }
  }, [room.state, meEntry, onLeave]);

  return (
    <div className="relative flex flex-col items-center">
      {/* TABLERO */}
      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          // Pass rolls directly (Swapped)
          topRoll={swapVisuals ? displayedBottomRoll : displayedTopRoll}
          bottomRoll={swapVisuals ? displayedTopRoll : displayedBottomRoll}

          // Rolling States (Swapped)
          isRollingTop={swapVisuals ? realBottomRolling : realTopRolling}
          isRollingBottom={swapVisuals ? realTopRolling : realBottomRolling}

          // Ghost States (Swapped)
          isGhostTop={swapVisuals ? isGhostBottom : isGhostTop}
          isGhostBottom={swapVisuals ? isGhostTop : isGhostBottom}

          statusText={statusText}
          subMessage={room.gameMeta?.message}
          winnerDisplay={winnerDisplay}

          onRoll={handleRoll}
          canRoll={myTurn && !rolling && !rolledThisRound}
          timeLeft={myTurn ? timeLeft : undefined} // Pass timer only if my turn

          onExit={() => {
            onLeave();
          }}

          onRejoin={onRejoin}
          isFinished={room.state === "FINISHED"}
          onOpenHistory={onOpenHistory}

          // Labels & Skins (Swapped)
          labelTop={swapVisuals ? bottomLabel : topLabel}
          labelBottom={swapVisuals ? topLabel : bottomLabel}
          diceColorTop={swapVisuals ? bottomSkin : topSkin}
          diceColorBottom={swapVisuals ? topSkin : bottomSkin}

          // Balances (Swapped)
          balanceTop={fmtUSD(swapVisuals ? bottomBalance : topBalance)}
          balanceBottom={fmtUSD(swapVisuals ? topBalance : bottomBalance)}
        />

        {/* POST-GAME OVERLAY */}
        {room.state === "FINISHED" && meEntry && showOverlay && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-xl p-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-white mb-2">Juego Terminado</h2>
            <p className="text-white/70 mb-6 text-center text-sm">
              ¿Quieres jugar otra vez?<br />
              <span className="text-xs opacity-50">(Salida automática en 30s)</span>
            </p>
            <div className="flex flex-col gap-3 w-full max-w-[200px]">
              <button
                onClick={() => onRejoin()}
                className="btn btn-primary w-full font-bold shadow-lg shadow-primary/20"
              >
                Jugar de Nuevo
              </button>
              <button
                onClick={() => onLeave()}
                className="btn btn-outline w-full border-white/20 text-white hover:bg-white/10"
              >
                Salir
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historial de Rondas (Visible para todos) */}
      <div className="w-full flex justify-center mt-6 z-10 relative">
        <DiceHistory room={room} swapVisuals={amTop} className="backdrop-blur-md shadow-xl" />
      </div>
    </div>
  );
}


