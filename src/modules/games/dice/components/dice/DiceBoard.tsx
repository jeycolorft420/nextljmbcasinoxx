"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import DiceDuel from "../DiceDuel"; // Asegúrate de que la ruta sea correcta
import { useSession } from "next-auth/react";

// URL de tu Game Server (Ajusta si es diferente en producción)
const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:4000";

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

export default function DiceBoard({ roomId, user }: { roomId: string; user: any }) {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Estados visuales locales
  const [isRolling, setIsRolling] = useState(false);
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    // 1. Conexión
    const socket = io(GAME_SERVER_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Conectado al Game Server");
      // Unirse a la sala con datos del usuario
      socket.emit("join_room", {
        roomId,
        user: {
          id: user.id,
          name: user.name,
          avatar: user.image,
          selectedDiceColor: user.selectedDiceColor // Si tienes esto en sesión
        }
      });
    });

    // 2. Escuchar Actualizaciones de Estado
    socket.on("update_game", (state: GameState) => {
      console.log("🎮 Update:", state);
      setGameState(state);

      // Limpiar animaciones si cambió el turno
      if (state.turnUserId) {
        setAnimRolls(prev => ({ ...prev, [state.turnUserId!]: false }));
      }
    });

    // 3. Animación de Tiro (Evento específico)
    socket.on("dice_anim", ({ userId, result }: { userId: string, result: [number, number] }) => {
      // Activar flag de rodando para ese usuario
      setAnimRolls(prev => ({ ...prev, [userId]: true }));

      // Sonido
      const audio = new Audio("/sfx/dice-roll.mp3");
      audio.play().catch(() => { });

      // Desactivar animación tras 1s (y el estado update_game traerá el resultado final)
      setTimeout(() => {
        setAnimRolls(prev => ({ ...prev, [userId]: false }));
      }, 1000);
    });

    socket.on("game_over", ({ winnerId, prize }) => {
      if (winnerId === user.id) {
        toast.success(`¡Ganaste $${(prize / 100).toFixed(2)}!`);
        new Audio("/sfx/win.mp3").play().catch(() => { });
      } else {
        toast.error("Has perdido esta vez.");
      }
    });

    socket.on("error", (err) => toast.error(err.message));

    return () => {
      socket.disconnect();
    };
  }, [roomId, user]);

  // --- LÓGICA DE RENDERIZADO ---

  if (!gameState) return <div className="text-white text-center mt-20">Cargando sala...</div>;

  const myPos = gameState.players.find(p => p.userId === user.id)?.position || 2;
  // Ordenamos para que "Yo" (bottom) sea siempre mi usuario, y "Oponente" (top) el otro
  const me = gameState.players.find(p => p.userId === user.id);
  const opponent = gameState.players.find(p => p.userId !== user.id);

  // Mapeo para DiceDuel.tsx
  // Si no hay oponente (esperando), pasamos null/ghost

  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === user.id;

  // Calcular props para componente visual
  const topRoll = opponent ? gameState.rolls[opponent.userId] : null;
  const bottomRoll = me ? gameState.rolls[me.userId] : null;

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center">
      <DiceDuel
        // Datos Oponente (Top)
        labelTop={opponent?.name || "Esperando..."}
        balanceTop={opponent ? `$${(opponent.balance / 100).toFixed(2)}` : "---"}
        diceColorTop={opponent?.skin as any || "white"}
        topRoll={topRoll}
        isRollingTop={opponent ? animRolls[opponent.userId] : false}
        isGhostTop={!opponent} // Mostrar fantasma si no hay nadie

        // Datos Míos (Bottom)
        labelBottom={me?.name || "Tú"}
        balanceBottom={me ? `$${(me.balance / 100).toFixed(2)}` : "---"}
        diceColorBottom={me?.skin as any || "white"}
        bottomRoll={bottomRoll}
        isRollingBottom={me ? animRolls[me.userId] : false}
        isGhostBottom={false}

        // Estado Global
        statusText={
          gameState.status === 'WAITING' ? "Esperando Oponente..." :
            gameState.status === 'FINISHED' ? "Partida Terminada" :
              isMyTurn ? "¡Tu Turno!" : `Turno de ${opponent?.name || "Rival"}`
        }

        // Controles
        canRoll={isMyTurn && !animRolls[user.id]} // Solo puedo tirar si es mi turno y no estoy ya rodando
        onRoll={() => {
          if (socketRef.current && isMyTurn) {
            socketRef.current.emit("roll_dice", { roomId });
          }
        }}

        // Timer (Opcional, si quieres mostrar cuenta atrás)
        timeLeft={isMyTurn ? 12 : undefined}
        onExit={() => window.location.href = '/rooms'}
      />
    </div>
  );
}
