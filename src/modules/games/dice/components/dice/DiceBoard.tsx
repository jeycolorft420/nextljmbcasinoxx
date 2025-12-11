"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DiceDuel from "@/modules/games/dice/components/DiceDuel";
import { type DiceSkin } from "./ThreeDDice";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

// ... (Types Entry y Room se mantienen igual) ...
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

// ... (DiceHistory se mantiene igual) ...
export function DiceHistory({ room, className = "", maxHeight = 220, swapVisuals = false }: { room: Room; className?: string; maxHeight?: number; swapVisuals?: boolean }) {
  // ... (Tu código de historial existente) ...
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
  const allowed: DiceSkin[] = ["white", "green", "blue", "yellow", "red", "purple", "black"];
  return (s && (allowed as readonly string[]).includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({ room, userId, email, onLeave, onRejoin, onOpenHistory, wheelSize }: Props) {
  const router = useRouter();
  const { play } = useAudio();

  // 1. MEMORIA DE POSICIÓN (Evita el "Seat Swap")
  const persistentPosition = useRef<number | null>(null);

  const meEntryRaw = room.entries?.find((e) => e.user.id === userId || (email && e.user.email === email)) ?? null;
  if (meEntryRaw && persistentPosition.current === null) {
    persistentPosition.current = meEntryRaw.position;
  }

  // Si tenemos posición guardada, la forzamos visualmente aunque la API falle un frame
  const amTop = persistentPosition.current === 1;
  const swapVisuals = amTop; // Si soy el 1, me pongo abajo (swap)

  // Identificar Jugadores por Posición Fija
  const topEntry = room.entries?.find(e => e.position === 1);
  const bottomEntry = room.entries?.find(e => e.position === 2);

  // 2. ESTADO VISUAL BLINDADO
  const [visualWinner, setVisualWinner] = useState<any>(null);
  const [animationLock, setAnimationLock] = useState(false); // Bloqueo global de UI
  const [rolling, setRolling] = useState(false);

  // Detectar ganador real desde el servidor
  const serverWinner = useMemo(() => {
    const history = room.gameMeta?.history || [];
    if (!history.length) return null;
    const lastRound = history[history.length - 1];
    // Solo consideramos ganador si la ronda del historial coincide o es reciente
    return {
      name: !lastRound.winnerEntryId ? "Empate" : (room.entries?.find((e) => e.id === lastRound.winnerEntryId)?.user?.name || "Jugador"),
      amount: fmtUSD(lastRound.damage ?? 0),
      isTie: !lastRound.winnerEntryId,
      round: lastRound.round
    };
  }, [room.gameMeta?.history, room.entries]);

  // Sincronización de Cartel (RADICAL: Obliga a esperar)
  const lastProcessedRound = useRef<number>(0);

  useEffect(() => {
    if (serverWinner && serverWinner.round !== lastProcessedRound.current) {
      lastProcessedRound.current = serverWinner.round;
      setAnimationLock(true); // 🔒 BLOQUEAR INTERFAZ

      // Secuencia: Rodar (1.5s) -> Mostrar Ganador (4s) -> Desbloquear
      setTimeout(() => {
        setVisualWinner(serverWinner);
        if (room.state === "FINISHED") {
          play("win");
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }

        // Mantener cartel 4 segundos COMPLETOS
        setTimeout(() => {
          setVisualWinner(null);
          setAnimationLock(false); // 🔓 DESBLOQUEAR
          router.refresh();
        }, 4000);

      }, 1500); // Esperar a que los dados "paren" visualmente
    }
  }, [serverWinner, room.state, router, play]);


  // 3. TIMER RADICAL (Siempre 30s)
  const [timer, setTimer] = useState(30);
  const roundStartedAt = (room.gameMeta?.roundStartedAt as number) || 0;

  useEffect(() => {
    // Si hay bloqueo de animación, no tocamos el timer (se queda en lo que estaba o 0)
    if (animationLock) return;

    const tick = () => {
      if (!roundStartedAt) {
        setTimer(30);
        return;
      }

      const now = Date.now();
      // El servidor nos da roundStartedAt en el FUTURO (+2000ms).
      // Si now < roundStartedAt, elapsed es negativo, perfecto para mantener 30s.
      const elapsed = (now - roundStartedAt) / 1000;

      // Si elapsed es -2, -1, 0, 0.5... visualTime será > 30.
      // Math.min(30) lo clava en 30.
      const visualTime = Math.min(30, Math.floor(30 - elapsed));

      setTimer(Math.max(0, visualTime));
    };

    // Ejecutar inmediatamente y luego en intervalo
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [roundStartedAt, animationLock]);


  // 4. LÓGICA DE DADOS Y ANIMACIÓN
  const rolls = room.gameMeta?.rolls || {};
  const lastDice = room.gameMeta?.lastDice || {};

  const activeTop = topEntry ? rolls[topEntry.user.id] : null;
  const activeBottom = bottomEntry ? rolls[bottomEntry.user.id] : null;

  // Si hay bloqueo, mostramos los dados "finales" (lastDice)
  // Si no, mostramos los dados activos
  const currentTopRoll = animationLock ? lastDice.top : (activeTop || lastDice.top);
  const currentBottomRoll = animationLock ? lastDice.bottom : (activeBottom || lastDice.bottom);

  // Animación del oponente
  const [opponentRolling, setOpponentRolling] = useState(false);
  const prevOppRoll = useRef("");
  const opRollData = swapVisuals ? activeBottom : activeTop; // El oponente es el "otro"

  useEffect(() => {
    const s = JSON.stringify(opRollData);
    if (s !== prevOppRoll.current && opRollData && !animationLock) {
      play("roll");
      setOpponentRolling(true);
      setTimeout(() => setOpponentRolling(false), 800);
    }
    prevOppRoll.current = s;
  }, [opRollData, animationLock, play]);


  // 5. STATUS TEXT (Limpio)
  let statusText = "";
  let myTurn = false;

  if (room.state === "FINISHED") statusText = "Juego Terminado";
  else if (animationLock || visualWinner) statusText = ""; // 🤫 Silencio durante animación
  else {
    // Lógica de turno estándar
    const starterId = room.gameMeta?.nextStarterUserId || topEntry?.user.id;
    const isTopStarter = topEntry?.user.id === starterId;
    const hasRolledTop = !!rolls[topEntry?.user.id || ""];
    const hasRolledBottom = !!rolls[bottomEntry?.user.id || ""];

    let turnId = null;
    if (isTopStarter) turnId = !hasRolledTop ? topEntry?.user.id : bottomEntry?.user.id;
    else turnId = !hasRolledBottom ? bottomEntry?.user.id : topEntry?.user.id;

    if (turnId) {
      myTurn = meEntryRaw?.user.id === turnId;
      statusText = myTurn ? "¡TU TURNO!" : "Esperando al oponente...";
    }
  }

  // ACCIÓN DE TIRAR
  const handleRoll = async () => {
    if (rolling || animationLock) return;
    setRolling(true);
    play("roll");
    try {
      await fetch(`/api/rooms/${room.id}/roll`, { method: "POST" });
      router.refresh();
    } catch { toast.error("Error"); }
    finally { setTimeout(() => setRolling(false), 500); }
  };

  // Heartbeat para despertar bots
  useEffect(() => {
    if (!myTurn && !animationLock && room.state === "OPEN") {
      const t = setInterval(() => router.refresh(), 3000);
      return () => clearInterval(t);
    }
  }, [myTurn, animationLock, room.state, router]);

  // SKINS
  const lastTopSkin = useRef<DiceSkin>("white");
  const lastBottomSkin = useRef<DiceSkin>("white");
  if (topEntry?.user.selectedDiceColor) lastTopSkin.current = toSkin(topEntry.user.selectedDiceColor);
  if (bottomEntry?.user.selectedDiceColor) lastBottomSkin.current = toSkin(bottomEntry.user.selectedDiceColor);

  return (
    <div className="relative flex flex-col items-center">
      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          // VISUALES SWAP (Para que siempre estés abajo)
          topRoll={swapVisuals ? currentBottomRoll : currentTopRoll}
          bottomRoll={swapVisuals ? currentTopRoll : currentBottomRoll}

          isRollingTop={swapVisuals ? rolling : opponentRolling}
          isRollingBottom={swapVisuals ? opponentRolling : rolling}

          // Ghost: Solo mostramos fantasmas si NO hay animación bloqueante
          isGhostTop={!animationLock && (swapVisuals ? !activeBottom : !activeTop)}
          isGhostBottom={!animationLock && (swapVisuals ? !activeTop : !activeBottom)}

          statusText={statusText}
          winnerDisplay={visualWinner} // Usamos el ganador "Delayed"

          onRoll={handleRoll}
          canRoll={myTurn && !rolling && !animationLock}
          timeLeft={myTurn && !animationLock ? timer : undefined} // Ocultar timer en animación

          onExit={onLeave}
          onRejoin={onRejoin}
          isFinished={room.state === "FINISHED"}
          onOpenHistory={onOpenHistory}

          labelTop={(swapVisuals ? bottomEntry?.user.name : topEntry?.user.name) || "J1"}
          labelBottom={(swapVisuals ? topEntry?.user.name : bottomEntry?.user.name) || "Tú"}

          diceColorTop={swapVisuals ? lastBottomSkin.current : lastTopSkin.current}
          diceColorBottom={swapVisuals ? lastTopSkin.current : lastBottomSkin.current}

          balanceTop={fmtUSD(room.gameMeta?.balances?.[swapVisuals ? bottomEntry?.user.id! : topEntry?.user.id!] ?? room.priceCents)}
          balanceBottom={fmtUSD(room.gameMeta?.balances?.[swapVisuals ? topEntry?.user.id! : bottomEntry?.user.id!] ?? room.priceCents)}
        />
      </div>
    </div>
  );
}
