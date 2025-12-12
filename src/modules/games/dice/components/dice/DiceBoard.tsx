"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import DiceDuel from "../DiceDuel";

const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:4000";

interface GameState {
  status: "WAITING" | "PLAYING" | "ROUND_END" | "FINISHED";
  round: number;
  turnUserId: string | null;
  rolls: { [key: string]: [number, number] };
  history: any[];
  players: any[];
  winnerId?: string;
}

// Props aceptan ahora onHistoryUpdate
export default function DiceBoard({ roomId, user, onHistoryUpdate }: { roomId: string; user: any; onHistoryUpdate?: (h: any[]) => void }) {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  useEffect(() => {
    let connectionUrl: string | undefined = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
    if (!connectionUrl && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      connectionUrl = "http://localhost:4000";
    }

    const socket = io(connectionUrl || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_room", {
        roomId,
        user: { id: user.id, name: user.name, avatar: user.image, selectedDiceColor: user.selectedDiceColor }
      });
    });

    socket.on("update_game", (state: GameState) => {
      setGameState(state);

      // ENVIAR HISTORIAL HACIA ARRIBA
      if (state.history && onHistoryUpdate) {
        onHistoryUpdate(state.history);
      }

      if (state.status === 'PLAYING') {
        setRoundWinner(null);
        setAnimRolls({});
      }
    });

    socket.on("dice_anim", ({ userId }: { userId: string }) => {
      setAnimRolls(prev => ({ ...prev, [userId]: true }));
      new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
      setTimeout(() => {
        setAnimRolls(prev => ({ ...prev, [userId]: false }));
      }, 1000);
    });

    socket.on("round_result", ({ winnerId }: { winnerId: string | null }) => {
      const winnerName = gameState?.players.find(p => p.userId === winnerId)?.name || "Empate";
      setRoundWinner(winnerName);
      if (winnerId) new Audio("/sfx/click.mp3").play().catch(() => { });
    });

    socket.on("game_over", ({ winnerId, prize }: any) => {
      if (winnerId === user.id) {
        toast.success(`¡Ganaste $${(prize / 100).toFixed(2)}!`);
        new Audio("/sfx/win.mp3").play().catch(() => { });
      } else {
        toast.error("Has perdido esta vez.");
      }
    });

    return () => { socket.disconnect(); };
  }, [roomId, user]);

  if (!gameState) return <div className="text-white/50 text-center mt-20 animate-pulse">Conectando...</div>;

  const me = gameState.players.find(p => p.userId === user.id);
  const opponent = gameState.players.find(p => p.userId !== user.id);
  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === user.id;
  const topRoll = opponent ? gameState.rolls[opponent.userId] : null;
  const bottomRoll = me ? gameState.rolls[me.userId] : null;

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center relative">

      {/* CARTEL DE GANADOR */}
      {gameState.status === 'ROUND_END' && roundWinner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-900 p-1 rounded-2xl shadow-2xl border border-white/20 transform scale-110">
            <div className="bg-black/90 rounded-xl px-12 py-8 text-center">
              <h2 className="text-emerald-400 font-bold text-xs uppercase tracking-[0.2em] mb-3">Ganador Ronda {gameState.round}</h2>
              <div className="text-4xl font-black text-white drop-shadow-2xl mb-2">
                {roundWinner === "Empate" ? "🤝 EMPATE" : `🏆 ${roundWinner}`}
              </div>
            </div>
          </div>
        </div>
      )}

      <DiceDuel
        labelTop={opponent?.name || "Esperando..."}
        balanceTop={opponent ? `$${(opponent.balance / 100).toFixed(2)}` : "---"}
        diceColorTop={opponent?.skin as any || "white"}
        topRoll={topRoll}
        isRollingTop={opponent ? animRolls[opponent.userId] : false}
        isGhostTop={!opponent}

        labelBottom={me?.name || "Tú"}
        balanceBottom={me ? `$${(me.balance / 100).toFixed(2)}` : "---"}
        diceColorBottom={me?.skin as any || "white"}
        bottomRoll={bottomRoll}
        isRollingBottom={me ? animRolls[me.userId] : false}
        isGhostBottom={false}

        // LIMPIAMOS EL TEXTO SI HAY GANADOR VISIBLE
        statusText={
          gameState.status === 'ROUND_END' ? "" : // Ocultar texto si hay cartel
            gameState.status === 'WAITING' ? "Esperando Oponente..." :
              gameState.status === 'FINISHED' ? "Partida Terminada" :
                isMyTurn ? "¡Tu Turno!" : `Turno de ${opponent?.name || "Rival"}`
        }

        canRoll={isMyTurn && !animRolls[user.id]}
        onRoll={() => {
          if (socketRef.current && isMyTurn) {
            socketRef.current.emit("roll_dice", { roomId });
          }
        }}
        timeLeft={isMyTurn ? 12 : undefined}
        onExit={() => window.location.href = '/rooms'}
      />
    </div>
  );
}

// Componente visual para la card de historial
export const DiceHistory = ({ history, myId }: { history?: any[]; myId?: string }) => {
  if (!history || history.length === 0) return <div className="p-4 text-center opacity-30 text-xs">Sin historial aún</div>;

  return (
    <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
      {history.slice().reverse().map((h, i) => {
        const isWin = h.winnerId === myId;
        const isTie = !h.winnerId;
        return (
          <div key={i} className={`flex justify-between items-center text-xs p-2 rounded ${isWin ? 'bg-green-900/20' : isTie ? 'bg-white/5' : 'bg-red-900/10'}`}>
            <span className="font-bold opacity-50">Ronda {h.round}</span>
            <div className="flex gap-2 font-mono">
              {/* Aquí podrías mostrar los dados si quisieras, h.rolls tiene los datos */}
              <span className={isWin ? "text-green-400 font-bold" : isTie ? "text-white/50" : "text-red-400"}>
                {isWin ? "+20%" : isTie ? "=" : "-20%"}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  );
};
