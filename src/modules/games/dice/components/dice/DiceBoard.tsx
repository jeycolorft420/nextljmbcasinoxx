"use client";

import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import DiceDuel from "../DiceDuel";

const DICE_ICONS = ["?", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function DiceBoard({ gameState, userId, onRoll }: { gameState: any, userId: string, onRoll: () => void }) {
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});

  // Estado para el tiempo
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Manejo de Sonidos y Animación de Dados
  useEffect(() => {
    if (gameState?.lastRoll && gameState.lastRoll.userId) {
      const uid = gameState.lastRoll.userId;
      setAnimRolls(p => ({ ...p, [uid]: true }));
      new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
      setTimeout(() => setAnimRolls(p => ({ ...p, [uid]: false })), 1000);
    }
  }, [gameState?.lastRoll]);

  // 2. Lógica del Temporizador (CORREGIDA)
  useEffect(() => {
    // Limpiar cualquier timer existente
    if (timerRef.current) clearInterval(timerRef.current);

    // Solo activamos el timer si estamos JUGANDO y hay un turno asignado
    if (gameState?.status === 'PLAYING' && gameState?.turnUserId) {

      setTimeLeft(30); // SIEMPRE iniciar en 30 al cambiar el turno

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Si no se está jugando (esperando o fin de ronda), no hay cuenta atrás
      setTimeLeft(0);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.turnUserId, gameState?.status, gameState?.round]); // Dependencias clave: si cambia el turno, reiniciamos

  if (!gameState) return <div className="text-white/50 text-center mt-20 animate-pulse">Conectando...</div>;

  const me = gameState.players.find((p: any) => p.userId === userId);
  const opponent = gameState.players.find((p: any) => p.userId !== userId);
  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === userId;

  // Determinar texto de estado (Ganador de ronda o Turno actual)
  let statusText = "";
  let statusColor = "text-white";

  if (gameState.status === 'ROUND_END') {
    // Lógica para mostrar quién ganó la ronda anterior
    const history = gameState.history || [];
    const lastRound = history[history.length - 1]; // Última ronda guardada

    if (lastRound) {
      if (lastRound.winnerId === userId) {
        statusText = "¡GANASTE LA RONDA! 🎉";
        statusColor = "text-green-400";
      } else if (lastRound.winnerId === opponent?.userId) {
        statusText = "RIVAL GANA LA RONDA 💀";
        statusColor = "text-red-400";
      } else {
        statusText = "¡EMPATE! ⚖️";
        statusColor = "text-yellow-400";
      }
    } else {
      statusText = "Preparando...";
    }
  }
  else if (gameState.status === 'WAITING') statusText = "Esperando Oponente...";
  else if (gameState.status === 'FINISHED') {
    if (gameState.reason === 'TIMEOUT') statusText = "¡Se acabó el tiempo!";
    else statusText = "Juego Terminado";
  }
  else {
    // Estado PLAYING
    statusText = isMyTurn ? `¡TU TURNO!` : `TURNO DEL RIVAL`;
    statusColor = isMyTurn ? "text-green-400 animate-pulse" : "text-white/60";
  }

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center relative">

      {/* BARRA DE TIEMPO SUPERIOR (Solo visible si se está jugando) */}
      {gameState.status === 'PLAYING' && (
        <div className="absolute top-0 left-0 w-full h-2 bg-gray-800">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 10 ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
      )}

      {/* COMPONENTE VISUAL DEL DUELO */}
      <DiceDuel
        labelTop={opponent?.name || "Esperando..."}
        balanceTop={opponent ? `$${(opponent.balance / 100).toFixed(2)}` : "---"}
        diceColorTop={opponent?.skin || "white"}
        topRoll={opponent ? gameState.rolls[opponent.userId] : null}
        isRollingTop={opponent ? animRolls[opponent.userId] : false}
        isGhostTop={!opponent}

        labelBottom={me?.name || "Tú"}
        balanceBottom={me ? `$${(me.balance / 100).toFixed(2)}` : "---"}
        diceColorBottom={me?.skin || "white"}
        bottomRoll={me ? gameState.rolls[me.userId] : null}
        isRollingBottom={me ? animRolls[me.userId] : false}
        isGhostBottom={false}

        // Pasamos el texto y color calculado
        statusText={
          <span className={`text-2xl font-bold uppercase tracking-widest ${statusColor}`}>
            {statusText}
            {gameState.status === 'PLAYING' && <span className="block text-sm text-white/50 mt-1">{timeLeft}s</span>}
          </span>
        }

        canRoll={isMyTurn && !animRolls[userId]}
        onRoll={onRoll}

        onExit={() => window.location.href = '/rooms'}
      />
    </div>
  );
}

// Historial se mantiene igual...
export const DiceHistory = ({ room }: { room: any }) => {
  const history = room?.history || [];
  const players = room?.players || [];
  if (!history.length) return <div className="p-4 text-center opacity-30 text-xs">Sin historial</div>;

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 w-64 max-h-[300px] overflow-y-auto custom-scrollbar">
      <h4 className="font-bold text-white/80 text-[10px] uppercase mb-2 flex justify-between">
        <span>Ronda</span>
        <span>Ganador</span>
      </h4>
      <div className="space-y-1">
        {[...history].reverse().map((h: any, i: number) => {
          const winnerName = players.find((p: any) => p.userId === h.winnerId)?.name || "EMPATE";
          const isTie = !h.winnerId;
          const rollStr = Object.keys(h.rolls).map(uid => {
            const r = h.rolls[uid];
            return `${DICE_ICONS[r[0]]}${DICE_ICONS[r[1]]}`;
          }).join(" vs ");

          return (
            <div key={i} className={`flex flex-col text-xs p-2 rounded ${isTie ? 'bg-white/5' : 'bg-green-900/10 border border-green-500/20'}`}>
              <div className="flex justify-between">
                <span className="font-mono text-white/50">#{h.round}</span>
                <span className={isTie ? "text-yellow-500" : "text-green-400 font-bold"}>{isTie ? "=" : winnerName.substring(0, 8)}</span>
              </div>
              <div className="text-[10px] text-white/40 text-center mt-1 font-mono tracking-widest">{rollStr}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
