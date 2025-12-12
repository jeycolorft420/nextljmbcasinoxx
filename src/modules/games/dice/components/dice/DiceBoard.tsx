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
  status: "WAITING" | "PLAYING" | "FINISHED";
  round: number;
  turnUserId: string | null;
  rolls: { [key: string]: [number, number] };
  players: Player[];
  winnerId?: string;
}

export default function DiceBoard({ roomId, user }: { roomId: string; user: any;[key: string]: any }) {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    // LÓGICA INTELIGENTE DE CONEXIÓN:
    // 1. Si hay una variable de entorno, úsala.
    // 2. Si estamos en producción (no localhost), usa la ruta relativa (para que Nginx maneje el proxy).
    // 3. Si estamos en local, usa localhost:4000.
    let connectionUrl: string | undefined = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

    if (!connectionUrl) {
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        connectionUrl = undefined; // Esto fuerza a usar el dominio actual (ej: misitio.com/socket.io)
      } else {
        connectionUrl = "http://localhost:4000";
      }
    }

    const socket = io(connectionUrl || undefined, {
      path: "/socket.io", // Importante para que Nginx lo capture
      transports: ["websocket", "polling"], // Habilitar ambos para mayor compatibilidad
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Conectado al Game Server");
      socket.emit("join_room", {
        roomId,
        user: {
          id: user.id,
          name: user.name,
          avatar: user.image,
          selectedDiceColor: user.selectedDiceColor
        }
      });
    });

    socket.on("connect_error", (err) => {
      console.error("Error de conexión Socket:", err.message);
    });

    socket.on("update_game", (state: GameState) => {
      setGameState(state);
      if (state.turnUserId) {
        setAnimRolls(prev => ({ ...prev, [state.turnUserId!]: false }));
      }
    });

    socket.on("dice_anim", ({ userId }: { userId: string }) => {
      setAnimRolls(prev => ({ ...prev, [userId]: true }));
      new Audio("/sfx/dice-roll.mp3").play().catch(() => { });
      setTimeout(() => {
        setAnimRolls(prev => ({ ...prev, [userId]: false }));
      }, 1000);
    });

    socket.on("game_over", ({ winnerId, prize }: any) => {
      if (winnerId === user.id) {
        toast.success(`¡Ganaste $${(prize / 100).toFixed(2)}!`);
        new Audio("/sfx/win.mp3").play().catch(() => { });
      } else {
        toast.error("Has perdido esta vez.");
      }
    });

    socket.on("error", (err: any) => toast.error(err.message));

    return () => {
      socket.disconnect();
    };
  }, [roomId, user]);

  if (!gameState) return <div className="text-white/50 text-center mt-20 animate-pulse">Conectando al servidor...</div>;

  const me = gameState.players.find(p => p.userId === user.id);
  const opponent = gameState.players.find(p => p.userId !== user.id);
  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === user.id;
  const topRoll = opponent ? gameState.rolls[opponent.userId] : null;
  const bottomRoll = me ? gameState.rolls[me.userId] : null;

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center">
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

export const DiceHistory = ({ room }: { room: any;[key: string]: any }) => {
  return (
    <div className="p-4 text-center opacity-50 text-xs">
      <p>Historial de ronda {room?.currentRound || 1}</p>
    </div>
  );
};
