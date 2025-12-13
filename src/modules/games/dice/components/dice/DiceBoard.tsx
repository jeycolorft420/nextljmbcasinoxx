"use client";

import React, { useEffect, useState, useRef } from "react";
import DiceDuel from "../DiceDuel";
import confetti from "canvas-confetti";

// Componente para dibujar los dados en el historial (Vectorial puro)
const HistoryDiceIcon = ({ val }: { val: number }) => {
  const dots = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  }[val] || [];

  return (
    <div className="w-5 h-5 bg-white text-black rounded-[4px] grid grid-cols-3 grid-rows-3 p-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.5)]" >
      {[...Array(9)].map((_, i) => (
        <div key={i} className="flex justify-center items-center">
          {dots.includes(i) && <div className="w-1 h-1 bg-black rounded-full" />}
        </div>
      ))
      }
    </div >
  );
};

export default function DiceBoard({ gameState: providedState, userId, onRoll, onReset, userSkin }: { gameState: any, userId: string, onRoll: () => void, onReset?: () => void, userSkin?: string }) {
  // NUKE LOGIC: If players are empty, force clean state locally if needed
  // We use a derived state or just use the providedState directly but ensure we handle empty array explicitly
  const gameState = (providedState?.players?.length === 0 && providedState?.status === 'WAITING')
    ? { ...providedState, rolls: {} } // Force rolls clear too
    : providedState;

  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto Rejoin State
  const [isAutoRejoining, setIsAutoRejoining] = useState(false);

  // FIX: Usar el timeLeft del servidor como base si está disponible
  const serverTimeLeft = gameState?.timeLeft;

  // New State: Result Overlay Delay
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  // New Effect: Handle Delayed Result Overlay (3s delay for ROUND_END and FINISHED)
  useEffect(() => {
    if (gameState?.status === 'FINISHED' || gameState?.status === 'ROUND_END') {
      const t = setTimeout(() => setShowResultOverlay(true), 3000);
      return () => clearTimeout(t);
    } else {
      setShowResultOverlay(false);
    }
  }, [gameState?.status]);

  // New Effect: Detect Reset & Trigger Auto Join
  useEffect(() => {
    if (isAutoRejoining && gameState?.status === 'WAITING' && gameState?.players?.length === 0) {
      // Reset detected!
      setIsAutoRejoining(false);
      if (onReset) onReset(); // onReset here will be mapped to 'join' in page.tsx
    }
  }, [gameState?.status, gameState?.players?.length, isAutoRejoining, onReset]);

  // 1. Efecto de Sonido y Animación de Dados al recibir resultado
  useEffect(() => {
    if (gameState?.lastRoll && gameState.lastRoll.userId) {
      const uid = gameState.lastRoll.userId;
      setAnimRolls(p => ({ ...p, [uid]: true }));
      new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
      setTimeout(() => setAnimRolls(p => ({ ...p, [uid]: false })), 1000);
    }
  }, [gameState?.lastRoll]);

  // 2. Temporizador Visual (Sincronizado con servidor)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (gameState?.status === 'PLAYING' && gameState?.turnUserId) {
      // Si el servidor nos da un tiempo, lo usamos. Si no, 30.
      setTimeLeft(serverTimeLeft !== undefined ? serverTimeLeft : 30);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else {
      setTimeLeft(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.turnUserId, gameState?.status, gameState?.round, serverTimeLeft]);

  // 3. Efectos de Victoria (Sonido + Confetti)
  useEffect(() => {
    if (gameState?.status === 'FINISHED') {
      const iWon = gameState.players.find((p: any) => p.userId === userId)?.balance > 0;
      if (iWon) {
        const audio = new Audio("/sfx/win.mp3");
        // FIX: audio.play() devuelve una promesa. audio en sí mismo es un elemento HTML y no tiene .catch
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            // Fallback si falla (ej: autoplay policy)
            new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
          });
        }


        const duration = 3000;
        const end = Date.now() + duration;
        const frame = () => {
          confetti({
            particleCount: 2,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#10b981', '#ffffff'] // Emerald & White
          });
          confetti({
            particleCount: 2,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#10b981', '#ffffff']
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
      }
    }
  }, [gameState?.status, userId]);

  // 4. Listener de Reset (Limpieza Total)
  useEffect(() => {
    if (!gameState) return;
    // Escuchar evento de reset global (esto requiere acceso al socket, pero DiceBoard recibe gameState)
    // Como no tenemos el socket instance aquí directamente, dependemos de que el padre 'Recargue' o
    // que el componente se desmonte.
    // SIN EMBARGO, Page.tsx maneja el socket centralized.
    // Vamos a añadir un log visual si el status cambia a WAITING de golpe.
    if (gameState.status === 'WAITING' && gameState.players.length === 0) {
      // Es un reset.
      // No hacemos nada especial visualmente, el 'WAITING' overlay se encargará.
    }
  }, [gameState?.status]);



  if (!gameState) return <div className="min-h-[400px] flex items-center justify-center text-emerald-500 font-mono animate-pulse">CONECTANDO...</div>;

  const me = gameState.players.find((p: any) => p.userId === userId);

  // SPECTATOR LOGIC: If I am not playing, show P1 bottom, P2 top (or vice versa)
  const isSpectator = !me;

  let topPlayer, bottomPlayer;

  if (isSpectator) {
    // Spectator sees P1 at bottom, P2 at top (arbitrary but stable)
    bottomPlayer = gameState.players[0];
    topPlayer = gameState.players[1];
  } else {
    // Player sees Self at bottom, Opponent at top
    bottomPlayer = me;
    topPlayer = gameState.players.find((p: any) => p.userId !== userId);
  }

  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === userId;

  // Name Formatting Helper
  const formatName = (p: any, isSelf: boolean) => {
    if (!p) return "Esperando...";
    if (isSelf) return `${p.name} (Tú)`;
    return p.name;
  };

  // --- CALCULATE FINAL ROLLS FOR DISPLAY ---
  // If in result mode (ROUND_END or FINISHED), use history to prevent 1-1 glitch
  let topRollDisp = topPlayer ? gameState.rolls[topPlayer.userId] : null;
  let bottomRollDisp = bottomPlayer ? gameState.rolls[bottomPlayer.userId] : null;

  if (gameState.status === 'ROUND_END' || gameState.status === 'FINISHED') {
    const lastRound = gameState.history[gameState.history.length - 1];
    if (lastRound) {
      if (topPlayer) topRollDisp = lastRound.rolls[topPlayer.userId] || topRollDisp;
      if (bottomPlayer) bottomRollDisp = lastRound.rolls[bottomPlayer.userId] || bottomRollDisp;
    }
  }

  // --- LÓGICA VISUAL DE ESTADOS ---
  let overlayContent = null;
  let borderColor = "border-white/5";

  if (showResultOverlay && gameState.status === 'ROUND_END') {
    const lastRound = gameState.history[gameState.history.length - 1];
    const isWinner = lastRound?.winnerId === userId;
    const isTie = !lastRound?.winnerId;
    const isTimeout = lastRound?.isTimeout;

    const myRoll = lastRound?.rolls[bottomPlayer?.userId] || [0, 0];
    const oppRoll = lastRound?.rolls[topPlayer?.userId] || [0, 0];

    // Spectator friendly names
    const winnerName = gameState.players.find((p: any) => p.userId === lastRound?.winnerId)?.name || "Alguien";

    // Cálculo de montos
    const amount = (gameState.stepValue / 100).toFixed(2);

    if (isSpectator) {
      borderColor = "border-yellow-500/50";
    } else {
      borderColor = isWinner ? "border-green-500/50" : isTie ? "border-yellow-500/50" : "border-red-500/50";
    }

    overlayContent = (
      <div className="flex flex-col items-center justify-center animate-in zoom-in duration-300 text-center bg-black/90 p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
        <div className={`text-5xl md:text-6xl font-black drop-shadow-2xl mb-4 ${isWinner && !isSpectator ? 'text-green-400' : isTie ? 'text-yellow-400' : isSpectator ? 'text-yellow-400' : 'text-red-500'}`}>
          {isSpectator
            ? (isTie ? "EMPATE" : `GANÓ ${winnerName.toUpperCase()}`)
            : (isWinner ? "¡GANASTE!" : isTie ? "EMPATE" : "PERDISTE")
          }
        </div>

        {/* Resultados de Dados */}
        <div className="flex items-center gap-6 mb-6 bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase text-white/50 mb-1">{isSpectator ? (bottomPlayer?.name || "J1") : "Tú"}</span>
            <div className="flex gap-2"><HistoryDiceIcon val={myRoll[0]} /><HistoryDiceIcon val={myRoll[1]} /></div>
          </div>
          <div className="text-2xl font-black text-white/20">VS</div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase text-white/50 mb-1">{isSpectator ? (topPlayer?.name || "J2") : "Rival"}</span>
            <div className="flex gap-2"><HistoryDiceIcon val={oppRoll[0]} /><HistoryDiceIcon val={oppRoll[1]} /></div>
          </div>
        </div>

        {/* Monto Ganado/Perdido (Solo si jugó) */}
        {!isTie && !isSpectator && (
          <div className={`text-2xl font-mono font-bold ${isWinner ? "text-green-400" : "text-red-400"}`}>
            {isWinner ? "+" : "-"}${amount}
          </div>
        )}

        <div className="mt-6 px-4 py-1 bg-white/10 rounded-full border border-white/5">
          <span className="text-xs text-white/60 font-bold uppercase tracking-widest">
            {isTimeout ? "POR TIEMPO ⏱️" : `RONDA ${gameState.round}`}
          </span>
        </div>
      </div>
    );
  } else if (showResultOverlay && gameState.status === 'FINISHED') {
    const iWonGame = gameState.players.find((p: any) => p.userId === userId)?.balance > 0;

    // Spectator Finish Screen
    // Find winner by max balance
    const winnerObj = gameState.players.reduce((prev: any, current: any) => (prev.balance > current.balance) ? prev : current, gameState.players[0]);
    const winnerName = winnerObj?.name || "Nadie";

    overlayContent = (
      <div className="flex flex-col items-center justify-center text-center animate-in fade-in duration-500 p-8 bg-black/90 rounded-3xl border border-white/10 backdrop-blur-xl max-w-sm mx-4">
        <div className="text-7xl mb-4">{isSpectator ? "🏁" : (iWonGame ? "🏆" : "☠️")}</div>
        <h1 className={`text-4xl md:text-5xl font-black uppercase mb-2 ${isSpectator ? 'text-white' : (iWonGame ? 'text-yellow-400' : 'text-gray-400')}`}>
          {isSpectator ? "FIN DE JUEGO" : (iWonGame ? "¡VICTORIA!" : "ELIMINADO")}
        </h1>
        {isSpectator && <p className="text-emerald-400 font-bold text-lg mb-4">Ganador: {winnerName}</p>}

        <p className="text-white/40 text-sm font-mono mb-8">LA PARTIDA HA TERMINADO</p>
        <div className="flex flex-col gap-3 w-full">
          <button onClick={() => window.location.href = '/rooms'} className="w-full px-8 py-4 bg-white text-black font-bold text-lg rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            VOLVER AL LOBBY
          </button>
        </div>
        {!isSpectator && (
          <button
            disabled={isAutoRejoining}
            onClick={() => {
              // Enable auto-rejoin flag
              setIsAutoRejoining(true);
            }}
            className="w-full px-8 py-3 bg-red-500/20 text-red-200 border border-red-500/50 font-bold text-sm rounded-xl hover:bg-red-500/30 transition-all uppercase tracking-wider disabled:opacity-50"
          >
            {isAutoRejoining ? "ESPERANDO REINICIO..." : "JUGAR DE NUEVO ↻"}
          </button>
        )}
      </div >
    );
  } else if (gameState.status === 'WAITING') {
    overlayContent = (
      <div className="flex flex-col items-center animate-pulse">
        <div className="w-20 h-20 border-4 border-t-emerald-500 border-white/5 rounded-full animate-spin mb-6"></div>
        <span className="text-xl font-bold tracking-[0.2em] text-emerald-500/80 uppercase">Esperando {isSpectator ? "Jugadores" : "Rival"}...</span>
      </div>
    );
  }

  return (
    <div className={`
        relative w-full h-full flex flex-col items-center justify-center overflow-hidden border transition-all duration-500
        /* Mobile Specific Styling */
        bg-slate-900/50 rounded-xl shadow-lg border-white/10
        /* Desktop Styling - FIX: Reduced height from 700px default (DiceDuel handles it) */
        md:bg-[#050505] md:rounded-3xl md:shadow-2xl md:border-white/5
    `}>

      {/* 1. FONDO DECORATIVO */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05),rgba(0,0,0,0))] pointer-events-none"></div>

      {/* 2. BARRA DE TIEMPO SUPERIOR */}
      {gameState.status === 'PLAYING' && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gray-900 z-50 rounded-t-xl md:rounded-t-3xl overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear shadow-[0_0_10px_currentColor] ${timeLeft < 10 ? 'bg-red-500 text-red-500' : 'bg-emerald-500 text-emerald-500'}`}
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
      )}

      {/* 3. OVERLAY DE MENSAJES */}
      {overlayContent && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-all duration-300 p-4">
          {overlayContent}
        </div>
      )}

      {/* 4. ÁREA DE JUEGO */}
      <div className={`flex flex-col md:flex-row w-full h-full z-10 ${borderColor}`}>

        {/* A. HISTORIAL LATERAL (Solo Desktop - Vertical corregido) */}
        {/* FIX: Width fijo, Overflow hidden, Padding bottom EXTENDIDO para evitar overlap con label */}
        <div className="hidden md:flex flex-col w-24 max-w-[96px] bg-black/30 border-r border-white/5 backdrop-blur-md relative overflow-hidden">
          <div className="h-full w-full overflow-hidden relative">
            {/* FIX: Added pb-32 to give ample space for the label */}
            <div className="absolute inset-x-0 bottom-0 top-0 overflow-y-auto no-scrollbar flex flex-col-reverse p-2 gap-3 pb-32">
              {[...gameState.history].reverse().slice(0, 10).map((h: any, i: number) => {
                const iWon = h.winnerId === userId;
                const isTie = !h.winnerId;
                const myRoll = h.rolls[userId] || [0, 0];
                const oppRoll = Object.values(h.rolls).find((r: any) => JSON.stringify(r) !== JSON.stringify(myRoll)) as number[] || [0, 0];

                return (
                  <div key={i} className={`flex flex-col items-center p-2 rounded-lg border transition-all hover:scale-105 cursor-help group relative w-full
                                  ${iWon ? 'bg-green-500/10 border-green-500/30' : isTie ? 'bg-white/5 border-white/10' : 'bg-red-500/10 border-red-500/30'}`}>

                    <span className="text-[9px] font-bold opacity-40 mb-1">R{h.round}</span>

                    {/* Mis Dados */}
                    {h.isTimeout && myRoll[0] === 0 ? <span className="text-xs">⏱️</span> : (
                      <div className="flex gap-1 scale-75"><HistoryDiceIcon val={myRoll[0]} /><HistoryDiceIcon val={myRoll[1]} /></div>
                    )}

                    <div className="w-4 h-[1px] bg-white/10 my-1"></div>

                    {/* Dados Rival */}
                    <div className="flex gap-1 scale-75 opacity-50"><HistoryDiceIcon val={oppRoll[0]} /><HistoryDiceIcon val={oppRoll[1]} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Etiqueta "HISTORIAL" Vertical */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black via-black/80 to-transparent flex items-end justify-center pb-6 pointer-events-none">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.3em] select-none" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              HISTORIAL
            </span>
          </div>
        </div>

        {/* B. TABLERO CENTRAL (DiceDuel) */}
        <div className="flex-1 relative flex items-center justify-center p-2 md:p-10">
          <div className="w-full max-w-[500px] aspect-square relative">
            <DiceDuel
              // Configuración Visual del Oponente (TOP)
              labelTop={formatName(topPlayer, topPlayer?.userId === userId)}
              balanceTop={topPlayer ? `$${(topPlayer.balance / 100).toFixed(2)}` : "---"}
              diceColorTop={topPlayer?.skin || "red"}
              topRoll={topRollDisp}
              isRollingTop={topPlayer ? animRolls[topPlayer.userId] : false}
              isGhostTop={!topPlayer}

              // Configuración Visual Propia (BOTTOM)
              labelBottom={formatName(bottomPlayer, bottomPlayer?.userId === userId)}
              balanceBottom={bottomPlayer ? `$${(bottomPlayer.balance / 100).toFixed(2)}` : "---"}
              // FIX: Use userSkin locally if available, otherwise server skin
              diceColorBottom={(bottomPlayer?.userId === userId) ? (userSkin || bottomPlayer?.skin || "blue") : (bottomPlayer?.skin || "blue")}
              bottomRoll={bottomRollDisp}
              isRollingBottom={bottomPlayer ? animRolls[bottomPlayer.userId] : false}
              isGhostBottom={!bottomPlayer}

              // Cartel de estado Central
              statusText={
                gameState.status === 'PLAYING' ? (
                  <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <span className={`text-2xl md:text-3xl font-black italic tracking-tighter drop-shadow-lg ${isMyTurn ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
                      {isMyTurn ? "¡TU TURNO!" : (isSpectator ? `Turno de ${gameState.players.find((p: any) => p.userId === gameState.turnUserId)?.name || "..."}` : "ESPERANDO...")}
                    </span>
                    <div className="mt-2 flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/5">
                      <div className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-emerald-500 animate-ping' : 'bg-slate-500'}`}></div>
                      <span className="text-xs font-mono text-white/60">{timeLeft}s</span>
                    </div>
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

// ✅ EXPORTACIÓN PARA PAGE.TSX Y SUPPORT MÓVIL
export const DiceHistory = ({ room }: { room: any }) => {
  const history = room?.history || [];
  const players = room?.players || [];
  if (!history.length) return <div className="p-4 text-center opacity-30 text-xs text-white">Sin historial</div>;

  return (
    // FIX: no-scrollbar added
    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto no-scrollbar p-1">
      {[...history].reverse().slice(0, 15).map((h: any, i: number) => {
        const winnerName = players.find((p: any) => p.userId === h.winnerId)?.name?.substring(0, 10) || "EMPATE";
        const isTie = !h.winnerId;

        return (
          <div key={i} className={`flex flex-col text-xs p-2 rounded-lg border ${isTie ? 'bg-white/5 border-white/10' : 'bg-emerald-900/10 border-emerald-500/20'}`}>
            <div className="flex justify-between mb-1">
              <span className="font-mono text-white/50">#{h.round}</span>
              <span className={isTie ? "text-yellow-500" : "text-emerald-400 font-bold"}>{isTie ? "=" : winnerName}</span>
            </div>
            {h.isTimeout && <div className="text-[9px] text-red-400 uppercase tracking-widest bg-red-900/20 rounded py-0.5 mb-1 text-center">Timeout</div>}
            <div className="flex justify-center gap-2 opacity-80 mt-1">
              {Object.keys(h.rolls).map((uid) => {
                const r: any = h.rolls[uid];
                return <div key={uid} className="flex gap-[1px]"><HistoryDiceIcon val={r?.[0] || 1} /><HistoryDiceIcon val={r?.[1] || 1} /></div>
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
