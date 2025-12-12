"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import DiceDuel from "../DiceDuel";

interface Player {
  userId: string;
  name: string;
  avatar: string;
  balance: number;
  position: 1 | 2;
  isBot: boolean;
  skin: string;
}

interface GameState {
  status: "WAITING" | "PLAYING" | "ROUND_END" | "FINISHED";
  round: number;
  turnUserId: string | null;
  rolls: { [key: string]: [number, number] };
  history: { round: number; winnerId: string | null; rolls: any }[]; // Nuevo campo
  players: Player[];
  winnerId?: string;
}

export default function DiceBoard({ roomId, user }: { roomId: string; user: any;[key: string]: any }) {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  useEffect(() => {
    let connectionUrl: string | undefined = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
    if (!connectionUrl) {
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        connectionUrl = undefined;
      } else {
        connectionUrl = "http://localhost:4000";
      }
    }

    const socket = io(connectionUrl || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Conectado");
      socket.emit("join_room", {
        roomId,
        user: { id: user.id, name: user.name, avatar: user.image, selectedDiceColor: user.selectedDiceColor }
      });
    });

    socket.on("update_game", (state: GameState) => {
      setGameState(state);
      // Limpiar animación y cartel al cambiar de ronda a jugando
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

      {/* CARTEL DE GANADOR DE RONDA (5 SEGUNDOS) */}
      {gameState.status === 'ROUND_END' && roundWinner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gradient-to-br from-emerald-600 to-emerald-900 p-1 rounded-2xl shadow-2xl border border-white/20">
            <div className="bg-black/90 rounded-xl px-10 py-6 text-center">
              <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-widest mb-2">Resultado Ronda {gameState.round}</h2>
              <div className="text-4xl font-black text-white drop-shadow-lg scale-110">
                {roundWinner === "Empate" ? "🤝 EMPATE" : `🏆 ${roundWinner}`}
              </div>
              <div className="mt-4 text-xs text-white/50 animate-pulse">Siguiente ronda en breve...</div>
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

        statusText={
          gameState.status === 'WAITING' ? "Esperando Oponente..." :
            gameState.status === 'FINISHED' ? "Partida Terminada" :
              gameState.status === 'ROUND_END' ? "Calculando..." :
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

      {/* HISTORIAL EN VIVO */}
      {gameState.history && gameState.history.length > 0 && (
        <div className="absolute top-4 left-4 z-40 bg-black/40 backdrop-blur-md border border-white/5 rounded-lg p-2 max-h-40 overflow-y-auto w-48 text-[10px]">
          <h4 className="font-bold text-white/70 mb-2 border-b border-white/5 pb-1">Historial</h4>
          <div className="space-y-1">
            {gameState.history.slice().reverse().map((h, i) => (
              <div key={i} className="flex justify-between items-center text-white/60">
                <span>R{h.round}</span>
                <span className={h.winnerId ? (h.winnerId === user.id ? "text-green-400" : "text-red-400") : "text-yellow-400"}>
                  {h.winnerId ? (h.winnerId === user.id ? "Ganaste" : "Perdiste") : "Empate"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mantenemos el export para evitar errores en page.tsx
export const DiceHistory = ({ room }: { room: any }) => null; 
