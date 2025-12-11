"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DiceDuel from "@/modules/games/dice/components/DiceDuel";
import { type DiceSkin } from "./ThreeDDice";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

// Types
type Entry = {
  id: string;
  position: number;
  user: { id: string; name: string | null; email: string; selectedDiceColor?: string | null; isBot?: boolean };
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

// DiceHistory Component
export function DiceHistory({ room, className = "", maxHeight = 220, swapVisuals = false }: { room: Room; className?: string; maxHeight?: number; swapVisuals?: boolean }) {
  const topEntry = room.entries?.find(e => e.position === 1);
  const bottomEntry = room.entries?.find(e => e.position === 2);
  const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;

  if (!room.gameMeta?.history?.length) return null;

  return (
    <div className={`w-full max-w-md bg-black/30 border border-white/10 rounded-xl p-3 ${className}`}>
      <h3 className="font-semibold mb-2 text-center text-sm">Historial de Rondas</h3>
      <div className="space-y-1" style={{ maxHeight, overflowY: "auto" }}>
        {[...room.gameMeta.history].reverse().map((r: any, i: number) => {
          const winner = r.winnerName || room.entries?.find((e) => e.id === r.winnerEntryId)?.user?.name || (r.winnerEntryId === null ? "Empate" : "Desconocido");
          const d = r.dice || {};
          const showD1 = swapVisuals ? d.bottom : d.top;
          const showD2 = swapVisuals ? d.top : d.bottom;
          return (
            <div key={i} className="flex justify-between items-center bg-black/40 rounded-lg px-3 py-1 text-xs hover:bg-white/10 transition">
              <span className="font-medium text-white">Ronda {r.round} · <span className="text-[#109e28]">{winner === "Empate" ? "Empate" : `Ganó ${winner}`}</span></span>
              <span className="opacity-80">{r.dice ? `(${showD1?.join(", ")} vs ${showD2?.join(", ")})` : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  room: Room;
  userId: string | null;
  email?: string | null;
  onReroll: () => Promise<void>;
  onForfeit: () => Promise<void>;
  onLeave: () => Promise<void>;
  onRejoin: () => Promise<void>;
  onOpenHistory?: () => void;
  onAfterAnim?: () => void;
  wheelSize: number;
};

const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;
function toSkin(s?: string | null): DiceSkin {
  const allowed = ["white", "green", "blue", "yellow", "red", "purple", "black"];
  return (s && allowed.includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({ room, userId, email, onLeave, onRejoin, onOpenHistory, wheelSize }: Props) {
  const router = useRouter();
  const { play } = useAudio();

  // 1. POSICIÓN PERSISTENTE
  const persistentPos = useRef<number | null>(null);
  const meEntry = room.entries?.find((e) => e.user.id === userId || (email && e.user.email === email));
  if (meEntry && persistentPos.current === null) persistentPos.current = meEntry.position;

  const amTop = persistentPos.current === 1;
  const swapVisuals = amTop; // P1 siempre se ve abajo

  const topEntry = room.entries?.find((e) => e.position === 1);
  const bottomEntry = room.entries?.find((e) => e.position === 2);

  // 2. ESTADO
  const [visualWinner, setVisualWinner] = useState<any>(null);
  const [animationLock, setAnimationLock] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [timer, setTimer] = useState(30);

  // 3. DETECTAR GANADOR (Server)
  const serverWinner = useMemo(() => {
    const history = room.gameMeta?.history || [];
    if (!history.length) return null;
    const last = history[history.length - 1];
    return {
      name: !last.winnerEntryId ? "Empate" : (room.entries?.find((e) => e.id === last.winnerEntryId)?.user?.name || "Jugador"),
      amount: fmtUSD(last.damage ?? 0),
      isTie: !last.winnerEntryId,
      round: last.round
    };
  }, [room.gameMeta?.history, room.entries]);

  // 4. SINCRONIZACIÓN DE ANIMACIÓN
  const lastRound = useRef(0);
  useEffect(() => {
    if (serverWinner && serverWinner.round !== lastRound.current) {
      lastRound.current = serverWinner.round;
      setAnimationLock(true);
      // 1.5s rodar -> 4s cartel -> Unlock
      setTimeout(() => {
        setVisualWinner(serverWinner);
        if (room.state === "FINISHED") play("win");
        setTimeout(() => {
          setVisualWinner(null);
          setAnimationLock(false);
          router.refresh();
        }, 4000);
      }, 1500);
    }
  }, [serverWinner, room.state, router, play]);

  // 5. TIMER REFORZADO
  const roundStartedAt = (room.gameMeta?.roundStartedAt as number) || 0;
  useEffect(() => {
    if (animationLock) return;
    const tick = () => {
      if (!roundStartedAt) { setTimer(30); return; }
      const elapsed = (Date.now() - roundStartedAt) / 1000;
      // El servidor manda tiempo futuro (+2s o +5s). Math.min lo clava en 30.
      setTimer(Math.max(0, Math.min(30, Math.floor(30 - elapsed))));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [roundStartedAt, animationLock]);

  // 6. SKINS SEGURAS (Bot no roba color)
  const getSkin = (e?: Entry) => {
    if (!e) return "white";
    if (e.user.isBot) return "red"; // Bot siempre rojo (ejemplo)
    return toSkin(e.user.selectedDiceColor);
  }
  const topSkin = getSkin(topEntry);
  const bottomSkin = getSkin(bottomEntry);

  // 7. RENDER
  const rolls = room.gameMeta?.rolls || {};
  const lastDice = room.gameMeta?.lastDice || {};

  // Si hay lock, mostrar lastDice. Si no, rolls actuales.
  const dTop = animationLock ? lastDice.top : (rolls[topEntry?.user.id || ""] || lastDice.top);
  const dBot = animationLock ? lastDice.bottom : (rolls[bottomEntry?.user.id || ""] || lastDice.bottom);

  // Animación Oponente
  const [opponentRolling, setOpponentRolling] = useState(false);
  const opRollData = swapVisuals ? rolls[bottomEntry?.user.id || ""] : rolls[topEntry?.user.id || ""];
  const prevOpRoll = useRef("");

  useEffect(() => {
    const s = JSON.stringify(opRollData);
    if (s !== prevOpRoll.current && opRollData && !animationLock) {
      setOpponentRolling(true);
      play("roll");
      setTimeout(() => setOpponentRolling(false), 800);
    }
    prevOpRoll.current = s;
  }, [opRollData, animationLock, play]);

  const handleRoll = async () => {
    if (rolling || animationLock) return;
    setRolling(true); play("roll");
    try { await fetch(`/api/rooms/${room.id}/roll`, { method: "POST" }); router.refresh(); }
    catch { toast.error("Error"); }
    finally { setTimeout(() => setRolling(false), 500); }
  };

  let statusText = animationLock ? "" : (meEntry ? ((meEntry.user.id === (room.gameMeta?.nextStarterUserId || topEntry?.user.id) ? "¡TU TURNO!" : "Esperando...")) : "Espectador");

  // Refined Status Check
  if (!animationLock && meEntry) {
    const starterId = room.gameMeta?.nextStarterUserId || topEntry?.user.id;
    const isMyTurnInitial = meEntry.user.id === starterId;
    // If I am starter and haven't rolled -> My Turn
    // If I am starter and HAVE rolled -> Opponent Turn
    const myRoll = rolls[meEntry.user.id];
    if (isMyTurnInitial && !myRoll) statusText = "¡TU TURNO!";
    else if (isMyTurnInitial && myRoll) statusText = "Esperando al oponente...";
    else if (!isMyTurnInitial) {
      // I'm second. If starter hasn't rolled -> Waiting
      // If starter rolled -> My Turn (if I havent rolled)
      const starterRoll = rolls[starterId || ""];
      if (!starterRoll) statusText = "Esperando al oponente...";
      else if (!myRoll) statusText = "¡TU TURNO!";
      else statusText = "Esperando resultado...";
    }
  }

  // Heartbeat
  useEffect(() => {
    if (!animationLock && room.state === "OPEN") {
      const t = setInterval(() => router.refresh(), 3000);
      return () => clearInterval(t);
    }
  }, [animationLock, room.state, router]);

  return (
    <div className="relative flex flex-col items-center">
      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          topRoll={swapVisuals ? dBot : dTop}
          bottomRoll={swapVisuals ? dTop : dBot}

          isRollingTop={swapVisuals ? rolling : opponentRolling}
          isRollingBottom={swapVisuals ? opponentRolling : rolling}

          isGhostTop={false}
          isGhostBottom={false}

          statusText={statusText}
          winnerDisplay={visualWinner}
          onRoll={handleRoll}
          canRoll={statusText === "¡TU TURNO!" && !rolling && !animationLock}
          timeLeft={!animationLock ? timer : undefined}

          labelTop={swapVisuals ? (bottomEntry?.user.name || "J2") : (topEntry?.user.name || "J1")}
          labelBottom="Tú"

          diceColorTop={swapVisuals ? bottomSkin : topSkin}
          diceColorBottom={swapVisuals ? topSkin : bottomSkin}

          balanceTop={fmtUSD(room.gameMeta?.balances?.[swapVisuals ? bottomEntry?.user.id! : topEntry?.user.id!] ?? room.priceCents)}
          balanceBottom={fmtUSD(room.gameMeta?.balances?.[swapVisuals ? topEntry?.user.id! : bottomEntry?.user.id!] ?? room.priceCents)}

          onExit={onLeave} onRejoin={onRejoin} isFinished={room.state === "FINISHED"}
          onOpenHistory={onOpenHistory}
        />
      </div>
    </div>
  );
}
