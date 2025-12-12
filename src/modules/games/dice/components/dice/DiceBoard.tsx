"use client";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import DiceDuel from "../DiceDuel";

const DICE_ICONS = ["?", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// ESTE COMPONENTE YA NO SE CONECTA AL SOCKET, SOLO MUESTRA LO QUE RECIBE
export default function DiceBoard({ gameState, userId, onRoll }: { gameState: any, userId: string, onRoll: () => void }) {
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (gameState?.lastRoll && gameState.lastRoll.userId) {
      const uid = gameState.lastRoll.userId;
      setAnimRolls(p => ({ ...p, [uid]: true }));
      new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
      setTimeout(() => setAnimRolls(p => ({ ...p, [uid]: false })), 1000);
    }
  }, [gameState?.lastRoll]); // Necesitamos pasar lastRoll desde page.tsx si queremos animacion exacta

  if (!gameState) return <div className="text-white/50 text-center mt-20 animate-pulse">Conectando...</div>;

  const me = gameState.players.find((p: any) => p.userId === userId);
  const opponent = gameState.players.find((p: any) => p.userId !== userId);
  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === userId;
  const topRoll = opponent ? gameState.rolls[opponent.userId] : null;
  const bottomRoll = me ? gameState.rolls[me.userId] : null;

  let statusText = "";
  if (gameState.status === 'ROUND_END') statusText = "";
  else if (gameState.status === 'WAITING') statusText = "Esperando Oponente...";
  else if (gameState.status === 'FINISHED') statusText = gameState.reason === 'TIMEOUT' ? "Victoria por Tiempo" : "Fin de Partida";
  else statusText = isMyTurn ? "¡Tu Turno!" : `Turno de ${opponent?.name || "Rival"}`;

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center relative">
      DiceDuel is being rendered here
      <DiceDuel
        labelTop={opponent?.name || "Esperando..."}
        balanceTop={opponent ? `$${(opponent.balance / 100).toFixed(2)}` : "---"}
        diceColorTop={opponent?.skin || "white"}
        topRoll={topRoll}
        isRollingTop={opponent ? animRolls[opponent.userId] : false}
        isGhostTop={!opponent}
        labelBottom={me?.name || "Tú"}
        balanceBottom={me ? `$${(me.balance / 100).toFixed(2)}` : "---"}
        diceColorBottom={me?.skin || "white"}
        bottomRoll={bottomRoll}
        isRollingBottom={me ? animRolls[me.userId] : false}
        isGhostBottom={false}
        statusText={statusText}
        canRoll={isMyTurn && !animRolls[userId]}
        onRoll={onRoll}
        timeLeft={isMyTurn ? 12 : undefined}
        onExit={() => window.location.href = '/rooms'}
      />
    </div>
  );
}

export const DiceHistory = ({ room }: { room: any }) => {
  const history = room?.history || [];
  const players = room?.players || [];
  if (!history.length) return <div className="p-4 text-center opacity-30 text-xs">Sin historial</div>;

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 w-64 max-h-[300px] overflow-y-auto custom-scrollbar">
      <h4 className="font-bold text-white/80 text-[10px] uppercase mb-2">Historial</h4>
      <div className="space-y-1">
        {[...history].reverse().map((h: any, i: number) => {
          const winnerName = players.find((p: any) => p.userId === h.winnerId)?.name || "EMPATE";
          const isTie = !h.winnerId;
          const rollStr = Object.keys(h.rolls).map(uid => {
            const r = h.rolls[uid];
            return `${DICE_ICONS[r[0]]}${DICE_ICONS[r[1]]}`;
          }).join(" vs ");

          return (
            <div key={i} className={`flex justify-between text-xs p-2 rounded ${isTie ? 'bg-white/5' : 'bg-green-900/20'}`}>
              <span className="font-mono text-white/50">#{h.round}</span>
              <span className="text-white font-mono tracking-widest">{rollStr}</span>
              <span className={isTie ? "text-yellow-500" : "text-green-400"}>{isTie ? "=" : winnerName.substring(0, 6)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
