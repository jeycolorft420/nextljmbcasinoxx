"use client";

import React from "react";
import { ThreeDDice, DiceSkin } from "./dice/ThreeDDice";

type Pair = [number, number];

export interface DiceDuelProps {
  size?: number;

  // Turn Based Props
  topRoll?: Pair | null;
  bottomRoll?: Pair | null;

  isRollingTop?: boolean;
  isRollingBottom?: boolean;

  isGhostTop?: boolean;
  isGhostBottom?: boolean;

  // Status & Controls
  statusText?: string;
  subMessage?: string;
  winnerDisplay?: { name: string; amount: string } | null;
  onExit?: () => void;
  onRejoin?: () => void;
  onRoll?: () => void;
  canRoll?: boolean;
  timeLeft?: number;
  isFinished?: boolean;
  onOpenHistory?: () => void;

  // Legacy / Auto Props
  rollKey?: number;
  targetTop?: Pair | null;
  targetBottom?: Pair | null;

  labelTop?: string;
  labelBottom?: string;
  diceColorTop?: DiceSkin;
  diceColorBottom?: DiceSkin;
}

// Helper Component for a single player's dice box
function DiceBox({
  pair,
  rolling,
  isGhost,
  label,
  isWinner,
  color,
  balance
}: {
  pair?: Pair | null;
  rolling?: boolean;
  isGhost?: boolean;
  label?: string;
  isWinner?: boolean | null;
  color?: DiceSkin;
  balance?: string;
}) {
  const sum = pair ? pair[0] + pair[1] : 0;
  const f1 = pair ? pair[0] : null;
  const f2 = pair ? pair[1] : null;

  return (
    <div className={`
        relative flex flex-col items-center transition-all duration-500 w-full
        
        /* Mobile Styles (Compact but wide) */
        p-2 gap-1 rounded-xl border
        
        /* Desktop Styles (Compact) */
        md:p-4 md:gap-2 md:rounded-2xl
        
        ${isWinner
        ? "bg-background border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
        : "bg-background border-white/5"}
        ${isGhost ? "opacity-80" : "opacity-100"}
     `}>

      {/* Header: Name & Balance */}
      <div className="flex w-full justify-between items-center px-2">
        <div className="flex flex-col items-start">
          <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/40">{label}</div>
          {isWinner && <div className="text-[#109e28] text-[9px] md:text-[10px] font-bold mt-0.5">WINNER</div>}
        </div>
        {balance && (
          <div className="text-sm md:text-lg font-mono font-bold text-white/80">
            {balance}
          </div>
        )}
      </div>

      {/* Dice Container */}
      <div className="relative py-2 md:py-4">
        {isGhost && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <span className="bg-black/80 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-white/60 backdrop-blur-md uppercase tracking-widest border border-white/10 shadow-xl">
              Esperando...
            </span>
          </div>
        )}

        {/* Responsive Dice Size via scaling or prop if supported. Using prop for cleaner render. */}
        {/* We can't easily switch props with CSS, so we use a responsive wrapper or just a medium size that works for both, or conditional rendering if we had width. 
            Here we'll use a CSS transform for mobile to scale down slightly. */}
        <div className={`flex gap-3 md:gap-6 perspective-[500px] transition-opacity duration-300 ${isGhost ? "opacity-30 blur-[1px]" : "opacity-100"} scale-100 md:scale-100 origin-center`}>
          <ThreeDDice face={f1} rolling={!!rolling} skin={color} size={85} variant={1} />
          <ThreeDDice face={f2} rolling={!!rolling} skin={color} size={85} variant={2} />
        </div>
      </div>

      {/* Sum / Result */}
      <div className={`text-2xl md:text-4xl font-mono font-bold transition-opacity text-white/20 ${rolling || !pair || isGhost ? "opacity-20" : "opacity-100 text-white/40"}`}>
        {rolling || !pair || isGhost ? "??" : sum}
      </div>
    </div>
  )
}

export default function DiceDuel({
  size = 320,
  topRoll,
  bottomRoll,
  isRollingTop,
  isRollingBottom,
  isGhostTop,
  isGhostBottom,
  statusText,
  subMessage,
  winnerDisplay,
  onExit,
  onRejoin,
  onRoll,
  canRoll,
  timeLeft,
  isFinished,
  onOpenHistory,
  labelTop = "Oponente",
  labelBottom = "Tú",
  diceColorTop = "white",
  diceColorBottom = "white",
  balanceTop,
  balanceBottom
}: DiceDuelProps & { balanceTop?: string, balanceBottom?: string }) {

  const sumTop = topRoll ? topRoll[0] + topRoll[1] : 0;
  const sumBottom = bottomRoll ? bottomRoll[0] + bottomRoll[1] : 0;

  const showWinner = !isRollingTop && !isRollingBottom && topRoll && bottomRoll;
  const winnerTop = showWinner && sumTop > sumBottom;
  const winnerBottom = showWinner && sumBottom > sumTop;

  const handleExit = () => {
    if (onExit) onExit();
  };

  return (
    // MAIN CONTAINER
    // Mobile: h-[100dvh] to fill screen, overflow-hidden.
    // Desktop: h-[700px] (fixed height to match history), justify-between, compact gaps.
    <div className="flex flex-col items-center w-full mx-auto 
                    h-full min-h-[500px] justify-between py-4
                    md:h-[700px] md:justify-between md:gap-2 md:max-w-lg md:py-4">

      {/* 1. Top Player (Opponent) */}
      <div className="w-full relative z-10 flex flex-1 items-center justify-center md:flex-none px-2 md:px-0">
        <DiceBox
          pair={topRoll}
          rolling={isRollingTop}
          isGhost={isGhostTop}
          label={labelTop}
          isWinner={winnerTop}
          color={diceColorTop}
          balance={balanceTop}
        />
      </div>

      {/* 2. CENTRAL ACTION / STATUS CARD */}
      {/* Mobile: max-w-[220px]. Desktop: max-w-xs. */}
      <div className="w-full max-w-[220px] md:max-w-[280px] z-20 shrink-0 my-2 md:my-0">
        {winnerDisplay ? (
          // WINNER STATE
          <div className="bg-background border border-emerald-500/30 rounded-xl md:rounded-2xl p-4 md:p-5 text-center shadow-2xl shadow-emerald-500/20 animate-in zoom-in duration-300 relative">
            <div className="text-emerald-400 text-[10px] md:text-[10px] font-bold uppercase tracking-widest mb-1">¡Ronda Ganada!</div>
            <div className="text-xl md:text-2xl font-bold text-white mb-1">{winnerDisplay.name}</div>
            <div className="text-emerald-400 font-mono font-bold text-base md:text-lg">{winnerDisplay.amount}</div>
          </div>
        ) : (
          // GAME STATE
          <div className="bg-card border border-white/10 rounded-xl md:rounded-2xl p-4 md:p-5 text-center shadow-2xl relative overflow-hidden group">
            {/* Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="relative z-10 space-y-2 md:space-y-3">
              <div>
                <div className="text-sm md:text-lg font-bold text-white leading-tight">
                  {statusText || "Esperando..."}
                </div>
                {subMessage && (
                  <div className="text-[9px] md:text-[10px] text-emerald-400 mt-1 font-medium">
                    {subMessage}
                  </div>
                )}
              </div>

              {/* TIMER DISPLAY */}
              {timeLeft !== undefined && (
                <div className="flex justify-center">
                  <div className={`
                     px-3 py-1 md:px-3 md:py-1 rounded-lg text-[10px] md:text-[10px] font-mono font-bold border shadow-lg flex items-center gap-1.5
                     ${timeLeft <= 10 ? "bg-red-500 text-white border-red-600 animate-pulse" : "bg-black/40 text-white border-white/20"}
                   `}>
                    <span>⏱</span>
                    <span>{timeLeft}s</span>
                  </div>
                </div>
              )}

              {/* BUTTON LOGIC: Roll or Exit */}
              {canRoll ? (
                <button
                  onClick={onRoll}
                  disabled={timeLeft === 0}
                  className={`w-full py-2.5 md:py-3 rounded-lg font-bold text-[10px] md:text-xs tracking-widest transition-all duration-200 uppercase text-white shadow-lg shadow-emerald-900/20 active:scale-95
                    ${timeLeft === 0 ? "bg-gray-500 cursor-not-allowed opacity-50" : "bg-[#10b981] hover:bg-[#059669]"}
                  `}
                >
                  {timeLeft === 0 ? "Tiempo Agotado" : "Tirar Dados"}
                </button>
              ) : (
                <button
                  onClick={handleExit}
                  className="w-full py-2.5 md:py-3 rounded-lg font-bold text-[10px] md:text-xs tracking-widest transition-all duration-200 uppercase bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                >
                  Salir
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Player (You) */}
      <div className="w-full relative z-10 flex flex-1 items-center justify-center md:flex-none px-2 md:px-0">
        {/* Mobile History Toggle (Inside Bottom Player Area) */}


        <DiceBox
          pair={bottomRoll}
          rolling={isRollingBottom}
          isGhost={isGhostBottom}
          label={labelBottom}
          isWinner={winnerBottom}
          color={diceColorBottom}
          balance={balanceBottom}
        />
      </div>

    </div>
  );
}

