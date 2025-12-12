"use client";

import React, { useEffect, useState, useRef } from "react";
import DiceDuel from "../DiceDuel";

// --- COMPONENTES AUXILIARES DE DISEÑO ---
const DiceIcon = ({ val }: { val: number }) => {
  // Renderiza un pequeño dado vectorial para el historial
  const dots = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  }[val] || [];

  return (
    <div className="w-5 h-5 bg-white rounded-md grid grid-cols-3 grid-rows-3 p-[2px] shadow-sm">
      {[...Array(9)].map((_, i) => (
        <div key={i} className="flex justify-center items-center">
          {dots.includes(i) && <div className="w-1 h-1 bg-black rounded-full" />}
        </div>
      ))}
    </div>
  );
};

export default function DiceBoard({ gameState, userId, onRoll }: { gameState: any, userId: string, onRoll: () => void }) {
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Efectos de sonido y animación
  useEffect(() => {
    if (gameState?.lastRoll && gameState.lastRoll.userId) {
      const uid = gameState.lastRoll.userId;
      setAnimRolls(p => ({ ...p, [uid]: true }));
      new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
      setTimeout(() => setAnimRolls(p => ({ ...p, [uid]: false })), 1000);
    }
  }, [gameState?.lastRoll]);

  // Lógica del Timer Visual
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (gameState?.status === 'PLAYING' && gameState?.turnUserId) {
      setTimeLeft(30);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else {
      setTimeLeft(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.turnUserId, gameState?.status, gameState?.round]);

  if (!gameState) return <div className="min-h-screen bg-black flex items-center justify-center text-white/50 animate-pulse font-mono tracking-widest">CONECTANDO A LA MESA...</div>;

  const me = gameState.players.find((p: any) => p.userId === userId);
  const opponent = gameState.players.find((p: any) => p.userId !== userId);
  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === userId;

  // --- LÓGICA DE MENSAJES CENTRALES MEJORADA ---
  let overlayContent = null;

  if (gameState.status === 'ROUND_END') {
    const lastRound = gameState.history[gameState.history.length - 1];
    const isWinner = lastRound?.winnerId === userId;
    const isTie = !lastRound?.winnerId;
    const isTimeout = lastRound?.isTimeout; // Flag nuevo del backend

    overlayContent = (
      <div className="flex flex-col items-center justify-center animate-in zoom-in duration-300">
        <div className={`text-6xl font-black drop-shadow-2xl mb-2 ${isWinner ? 'text-green-400' : isTie ? 'text-yellow-400' : 'text-red-500'}`}>
          {isWinner ? "¡GANASTE!" : isTie ? "EMPATE" : "PERDISTE"}
        </div>
        <div className="text-xl text-white/80 font-bold tracking-[0.3em] uppercase bg-black/50 px-4 py-1 rounded-full backdrop-blur-sm border border-white/10">
          {isTimeout ? "POR TIEMPO" : `RONDA ${gameState.round}`}
        </div>
        {!isTie && (
          <div className={`mt-4 text-sm font-mono ${isWinner ? 'text-green-200' : 'text-red-200'}`}>
            {isWinner ? "+ APUESTA GANADA" : "- SALDO DESCONTADO"}
          </div>
        )}
      </div>
    );
  } else if (gameState.status === 'FINISHED') {
    const iWonGame = gameState.players.find((p: any) => p.userId === userId)?.balance > 0;
    overlayContent = (
      <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
        <div className="text-7xl mb-4">{iWonGame ? "🏆" : "💀"}</div>
        <h1 className={`text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b ${iWonGame ? 'from-yellow-300 to-yellow-600' : 'from-gray-300 to-gray-600'}`}>
          {iWonGame ? "VICTORIA" : "DERROTA"}
        </h1>
        <p className="text-white/50 mt-2 font-mono">LA PARTIDA HA FINALIZADO</p>
        <button onClick={() => window.location.href = '/rooms'} className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-full hover:scale-105 transition-transform">
          VOLVER AL LOBBY
        </button>
      </div>
    );
  } else if (gameState.status === 'WAITING') {
    overlayContent = (
      <div className="flex flex-col items-center animate-pulse">
        <div className="w-12 h-12 border-4 border-t-blue-500 border-white/10 rounded-full animate-spin mb-4"></div>
        <span className="text-xl font-light tracking-widest text-blue-200">ESPERANDO OPONENTE...</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[600px] bg-[#0a0a0a] overflow-hidden rounded-3xl border border-white/5 shadow-2xl flex flex-col">

      {/* FONDO DECORATIVO */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black pointer-events-none"></div>

      {/* BARRA DE TIEMPO SUPERIOR (Estilo Neon) */}
      {gameState.status === 'PLAYING' && (
        <div className="absolute top-0 left-0 w-full h-2 bg-gray-900 z-50">
          <div
            className={`h-full transition-all duration-1000 ease-linear shadow-[0_0_15px_currentColor] ${timeLeft < 10 ? 'bg-red-500 text-red-500' : 'bg-emerald-500 text-emerald-500'}`}
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
      )}

      {/* OVERLAY DE ESTADO (Para Waiting, Round End, Game Over) */}
      {overlayContent && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-all">
          {overlayContent}
        </div>
      )}

      {/* CONTENIDO PRINCIPAL DEL JUEGO */}
      <div className="flex-1 flex relative z-10">

        {/* COLUMNA IZQUIERDA: HISTORIAL ESTILIZADO */}
        <div className="w-20 border-r border-white/5 bg-black/20 flex flex-col py-4 gap-3 items-center overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-bold text-white/30 uppercase writing-vertical rotate-180 mb-2">Historial</div>
          {[...gameState.history].reverse().slice(0, 10).map((h: any, i: number) => {
            const iWon = h.winnerId === userId;
            const isTie = !h.winnerId;
            const myRoll = h.rolls[userId];
            const oppRoll = Object.values(h.rolls).find((r: any) => r !== myRoll) as number[] || [0, 0]; // Fallback

            return (
              <div key={i} className={`
                          w-14 p-1 rounded-lg border flex flex-col items-center gap-1 transition-all hover:scale-110
                          ${iWon ? 'bg-green-500/10 border-green-500/40' : isTie ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-red-500/10 border-red-500/40'}
                      `}>
                <span className="text-[8px] font-mono text-white/50">#{h.round}</span>
                {/* Si fue timeout y mis dados son 0, mostrar icono de reloj o X */}
                {h.isTimeout && (!myRoll || (myRoll[0] === 0)) ? (
                  <span className="text-xs text-red-400">⏱️</span>
                ) : (
                  myRoll && <div className="flex gap-[2px]"><DiceIcon val={myRoll[0]} /><DiceIcon val={myRoll[1]} /></div>
                )}
                <div className="w-full h-[1px] bg-white/10"></div>
                {/* Dados oponente */}
                <div className="flex gap-[2px] opacity-50"><DiceIcon val={oppRoll[0]} /><DiceIcon val={oppRoll[1]} /></div>
              </div>
            )
          })}
        </div>

        {/* COLUMNA DERECHA: TABLERO DE DADOS */}
        <div className="flex-1 flex flex-col relative">

          {/* COMPONENTE DiceDuel (Donde están los dados 3D y avatares) */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <DiceDuel
              // Oponente (Top)
              labelTop={opponent?.name || "Buscando..."}
              balanceTop={opponent ? `$${(opponent.balance / 100).toFixed(2)}` : "---"}
              diceColorTop={opponent?.skin || "red"}
              topRoll={opponent ? gameState.rolls[opponent.userId] : null}
              isRollingTop={opponent ? animRolls[opponent.userId] : false}
              isGhostTop={!opponent}

              // Yo (Bottom)
              labelBottom={me?.name || "Tú"}
              balanceBottom={me ? `$${(me.balance / 100).toFixed(2)}` : "---"}
              diceColorBottom={me?.skin || "blue"}
              bottomRoll={me ? gameState.rolls[me.userId] : null}
              isRollingBottom={me ? animRolls[me.userId] : false}
              isGhostBottom={false}

              // Texto Central (Solo cuando se está jugando activamente)
              statusText={
                gameState.status === 'PLAYING' ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-2xl font-black italic tracking-widest ${isMyTurn ? 'text-green-400 animate-pulse' : 'text-gray-500'}`}>
                      {isMyTurn ? "TU TURNO" : "ESPERANDO..."}
                    </span>
                    <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded">
                      {timeLeft}s
                    </span>
                  </div>
                ) : ""
              }

              canRoll={isMyTurn && !animRolls[userId]}
              onRoll={onRoll}
              onExit={() => window.location.href = '/rooms'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ EXPORTACIÓN PARA PAGE.TSX
export const DiceHistory = ({ room }: { room: any }) => {
  const history = room?.history || [];
  const players = room?.players || [];
  if (!history.length) return <div className="p-4 text-center opacity-30 text-xs">Sin historial</div>;

  return (
    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
      {[...history].reverse().slice(0, 15).map((h: any, i: number) => {
        const winnerName = players.find((p: any) => p.userId === h.winnerId)?.name?.substring(0, 10) || "EMPATE";
        const isTie = !h.winnerId;

        return (
          <div key={i} className={`flex flex-col text-xs p-2 rounded ${isTie ? 'bg-white/5' : 'bg-green-900/10 border border-green-500/20'}`}>
            <div className="flex justify-between mb-1">
              <span className="font-mono text-white/50">#{h.round}</span>
              <span className={isTie ? "text-yellow-500" : "text-green-400 font-bold"}>{isTie ? "=" : winnerName}</span>
            </div>
            {h.isTimeout && <div className="text-[9px] text-red-500 uppercase tracking-widest bg-red-900/20 rounded py-0.5 mb-1 text-center">Timeout</div>}
            <div className="flex justify-center gap-2 opacity-80">
              {Object.keys(h.rolls).map((uid) => {
                const r: any = h.rolls[uid];
                return <div key={uid} className="flex gap-[1px]"><DiceIcon val={r?.[0] || 1} /><DiceIcon val={r?.[1] || 1} /></div>
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
