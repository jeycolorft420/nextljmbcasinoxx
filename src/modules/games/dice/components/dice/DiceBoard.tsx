// src/components/dice/DiceBoard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

// ----------------- Historial Visual -----------------
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
  const allowed: DiceSkin[] = ["white", "green", "blue", "yellow", "red", "purple"];
  return (s && (allowed as readonly string[]).includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({ room, userId, email, onReroll, onForfeit, onLeave, onRejoin, onOpenHistory, wheelSize }: Props) {
  const router = useRouter();
  const { play } = useAudio();

  // 1. Identificar Entradas
  const topEntry = room.entries?.find(e => e.position === 1);
  const bottomEntry = room.entries?.find(e => e.position === 2);
  const meEntry = room.entries?.find((e) => e.user.id === userId || (email && e.user.email === email)) ?? null;

  // 2. Estado del Servidor (Autoridad Suprema)
  const now = Date.now();
  const resolvingUntil = (room.gameMeta?.roundResolvingUntil as number) || 0;
  // Si falta tiempo para terminar la resolución, estamos en modo "Show Winner"
  const isResolving = resolvingUntil > now;

  // 3. Lógica de Turnos
  const rolls = room.gameMeta?.rolls || {};
  const lastDice = room.gameMeta?.lastDice || {}; // Dados persistentes

  // Visual Dice: Si estamos resolviendo, mostrar los ÚLTIMOS dados, no los vacíos
  const activeTop = topEntry ? rolls[topEntry.user.id] : null;
  const activeBottom = bottomEntry ? rolls[bottomEntry.user.id] : null;

  const currentTopRoll = activeTop || (isResolving ? lastDice.top : null) || lastDice.top || null;
  const currentBottomRoll = activeBottom || (isResolving ? lastDice.bottom : null) || lastDice.bottom || null;


  // 4. Calcular Ganador (Solo si estamos en fase de resolución)
  const winnerDisplay = useMemo(() => {
    if (!isResolving) return null;
    const history = room.gameMeta?.history || [];
    if (history.length === 0) return null;

    // El último en el historial es el que acabamos de jugar
    const lastRound = history[history.length - 1];

    const isTie = !lastRound.winnerEntryId;
    const winnerName = isTie ? "Empate" : (room.entries?.find((e) => e.id === lastRound.winnerEntryId)?.user?.name || "Jugador");
    const damage = lastRound.damage ?? 0;

    return { name: winnerName, amount: fmtUSD(damage), isTie };
  }, [isResolving, room.gameMeta?.history, room.entries]);

  // 5. Auto-Refresco Inteligente (Sincronización Perfecta)
  useEffect(() => {
    if (isResolving) {
      const timeLeft = resolvingUntil - Date.now();
      // Programar refresco EXACTAMENTE cuando termine la animación del servidor
      const t = setTimeout(() => {
        router.refresh();
      }, timeLeft + 100); // +100ms de buffer
      return () => clearTimeout(t);
    }
  }, [isResolving, resolvingUntil, router]);

  // 6. Sonidos y Confetti
  useEffect(() => {
    if (isResolving && winnerDisplay) {
      if (room.state === "FINISHED") play("win"); // Solo sonido win si terminó el juego
      if (room.state === "FINISHED") {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }
    }
  }, [isResolving, winnerDisplay, room.state, play]);

  // 7. Textos de Estado (Limpieza de Carteles)
  let statusText = "";
  let myTurn = false;

  const starterId = room.gameMeta?.nextStarterUserId || topEntry?.user.id;
  const isTopStarter = topEntry?.user.id === starterId;
  const hasRolledTop = !!rolls[topEntry?.user.id || ""];
  const hasRolledBottom = !!rolls[bottomEntry?.user.id || ""];

  let currentTurnUserId = null;
  if (isTopStarter) {
    if (!hasRolledTop) currentTurnUserId = topEntry?.user.id;
    else if (!hasRolledBottom) currentTurnUserId = bottomEntry?.user.id;
  } else {
    if (!hasRolledBottom) currentTurnUserId = bottomEntry?.user.id;
    else if (!hasRolledTop) currentTurnUserId = topEntry?.user.id;
  }

  if (room.state === "FINISHED") {
    statusText = "Juego Terminado";
  } else if (winnerDisplay) {
    statusText = ""; // Ocultar texto "Esperando..." si hay cartel de ganador
  } else if (!topEntry || !bottomEntry) {
    statusText = "Esperando jugadores...";
  } else if (currentTurnUserId) {
    const isMyTurn = meEntry?.user.id === currentTurnUserId;
    myTurn = isMyTurn;
    const turnName = room.entries?.find(e => e.user.id === currentTurnUserId)?.user.name || "Oponente";
    statusText = myTurn ? "¡TU TURNO!" : `Esperando a ${turnName}...`;
  }

  // 8. Acciones
  const [rolling, setRolling] = useState(false);

  const handleRoll = async () => {
    if (rolling) return;
    setRolling(true);
    play("roll");
    try {
      await fetch(`/api/rooms/${room.id}/roll`, { method: "POST" });
      router.refresh(); // Refresco optimista
    } catch {
      toast.error("Error al tirar");
    } finally {
      setRolling(false);
    }
  };

  // Heartbeat de seguridad (polling lento por si falla el socket)
  useEffect(() => {
    if (!myTurn && !isResolving && room.state === "OPEN") {
      const t = setInterval(() => router.refresh(), 4000);
      return () => clearInterval(t);
    }
  }, [myTurn, isResolving, room.state, router]);

  // Visual Swap (Si soy P1, me veo abajo)
  const amTop = meEntry?.position === 1;
  const swapVisuals = amTop;

  // Estado para animar al oponente
  const [opponentRolling, setOpponentRolling] = useState(false);
  const prevOpponentRoll = useRef<string>("");

  // Detectar cambio en los dados del oponente para animar
  const opponentRollData = swapVisuals ? rolls[bottomEntry?.user.id || ""] : rolls[topEntry?.user.id || ""];

  useEffect(() => {
    const currentStr = JSON.stringify(opponentRollData);
    // Si cambiaron los dados y no es nulo (es un tiro nuevo)
    if (currentStr !== prevOpponentRoll.current && opponentRollData) {
      play("roll");
      setOpponentRolling(true);
      setTimeout(() => setOpponentRolling(false), 1000); // 1s de animación
    }
    prevOpponentRoll.current = currentStr;
  }, [opponentRollData, play]);
  const topLabel = (topEntry?.user.name || "J1") + (amTop ? " (Tú)" : "");
  const bottomLabel = (bottomEntry?.user.name || "J2") + (!amTop && meEntry ? " (Tú)" : "");

  // Skins (Persistencia)
  const lastTopSkin = useRef<DiceSkin>("white");
  const lastBottomSkin = useRef<DiceSkin>("white");
  if (topEntry?.user.selectedDiceColor) lastTopSkin.current = toSkin(topEntry.user.selectedDiceColor);
  if (bottomEntry?.user.selectedDiceColor) lastBottomSkin.current = toSkin(bottomEntry.user.selectedDiceColor);

  // Timer UI
  const [timer, setTimer] = useState(30);
  const roundStartedAt = (room.gameMeta?.roundStartedAt as number) || 0;

  useEffect(() => {
    if (myTurn && !rolling) {
      const tick = () => {
        // Si no hay fecha de inicio (0), asumimos que el turno acaba de empezar (30s)
        if (!roundStartedAt) {
          setTimer(30);
          return;
        }
        const elap = (Date.now() - roundStartedAt) / 1000;
        setTimer(Math.max(0, 30 - Math.floor(elap)));
      };
      tick();
      const t = setInterval(tick, 1000);
      return () => clearInterval(t);
    }
  }, [myTurn, rolling, roundStartedAt]);

  return (
    <div className="relative flex flex-col items-center">
      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          topRoll={swapVisuals ? currentBottomRoll : currentTopRoll}
          bottomRoll={swapVisuals ? currentTopRoll : currentBottomRoll}

          isRollingBottom={rolling}       // Mi animación (siempre abajo visualmente)
          isRollingTop={opponentRolling}  // Animación del oponente (siempre arriba visualmente)

          // Ghost: Si no hay roll activo y no estamos resolviendo, mostrar gris
          isGhostTop={swapVisuals ? (!activeBottom && !isResolving) : (!activeTop && !isResolving)}
          isGhostBottom={swapVisuals ? (!activeTop && !isResolving) : (!activeBottom && !isResolving)}

          statusText={statusText}
          subMessage={winnerDisplay ? undefined : room.gameMeta?.message}
          winnerDisplay={winnerDisplay} // ESTO ES LO QUE MUESTRA EL CARTEL

          onRoll={handleRoll}
          canRoll={myTurn && !rolling && !isResolving}
          timeLeft={myTurn ? timer : undefined}

          onExit={onLeave}
          onRejoin={onRejoin}
          isFinished={room.state === "FINISHED"}
          onOpenHistory={onOpenHistory}

          labelTop={swapVisuals ? bottomLabel : topLabel}
          labelBottom={swapVisuals ? topLabel : bottomLabel}
          diceColorTop={swapVisuals ? lastBottomSkin.current : lastTopSkin.current}
          diceColorBottom={swapVisuals ? lastTopSkin.current : lastBottomSkin.current}

          // Balances
          balanceTop={fmtUSD(room.gameMeta?.balances?.[swapVisuals ? bottomEntry?.user.id! : topEntry?.user.id!] ?? room.priceCents)}
          balanceBottom={fmtUSD(room.gameMeta?.balances?.[swapVisuals ? topEntry?.user.id! : bottomEntry?.user.id!] ?? room.priceCents)}
        />
      </div>
    </div>
  );
}
