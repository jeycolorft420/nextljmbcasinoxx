"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import DiceDuel from "@/modules/games/dice/components/DiceDuel";
import { type DiceSkin } from "./ThreeDDice";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

let socket: Socket;

// Helper para skins
function toSkin(s?: string | null): DiceSkin {
  const allowed = ["white", "green", "blue", "yellow", "red", "purple", "black"];
  return (s && allowed.includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({ room, userId, email, onLeave, onRejoin, wheelSize, userSkin = "white" }: any) {
  const router = useRouter();
  const { play } = useAudio();

  // ESTADO
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<any>(null);
  const [rolling, setRolling] = useState(false);
  const [opponentRolling, setOpponentRolling] = useState(false);

  // Inicializar Socket
  useEffect(() => {
    // Configuración de URL flexible (Local vs Prod)
    const SOCKET_URL = undefined; // 'undefined' intenta conectar al mismo dominio (vía Nginx proxy)

    socket = io({
      path: "/socket.io",
      transports: ["websocket"],
      reconnectionAttempts: 20
    });

    socket.on("connect", () => {
      setIsConnected(true);
      // Unirse a la sala inmediatamente
      socket.emit("join_room", {
        roomId: room.id,
        user: {
          id: userId,
          name: room.entries.find((e: any) => e.user.id === userId)?.user.name || "Jugador",
          selectedDiceColor: userSkin
        }
      });
    });

    socket.on("update_game", (data) => {
      console.log("🎮 Estado recibido:", data);
      setGameState(data);
    });

    socket.on("dice_rolled", ({ userId: rollerId, roll }: any) => {
      play("roll");
      if (rollerId !== userId) {
        setOpponentRolling(true);
        setTimeout(() => setOpponentRolling(false), 800);
      }
    });

    socket.on("game_over", ({ winnerId }: any) => {
      if (winnerId === userId) {
        play("win");
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    });

    socket.on("disconnect", () => setIsConnected(false));

    return () => { socket.disconnect(); };
  }, [room.id, userId]);

  // --- LÓGICA VISUAL ---

  // 1. Identificar Datos
  const players = gameState?.players || [];

  // Buscarme a mí y a mi oponente
  const me = players.find((p: any) => p.userId === userId);

  // 2. Lógica de "Espejo" (Yo siempre abajo)
  // Si soy Position 1 (Host) -> swapVisuals = true (para mandarme abajo)
  // Si soy Position 2 (Retador) -> swapVisuals = false (ya estoy abajo por defecto en el diseño P2)
  const amTopPosition = me?.position === 1;
  const swapVisuals = amTopPosition;

  const p1 = players.find((p: any) => p.position === 1);
  const p2 = players.find((p: any) => p.position === 2);

  // 3. Asignar Dados y Skins
  // Top: Si swap es true, Top visual es P2. Si swap es false, Top visual es P1.
  const visualTopPlayer = swapVisuals ? p2 : p1;
  const visualBottomPlayer = swapVisuals ? p1 : p2;

  const topRoll = visualTopPlayer ? gameState?.rolls?.[visualTopPlayer.userId] : null;
  const bottomRoll = visualBottomPlayer ? gameState?.rolls?.[visualBottomPlayer.userId] : null;

  // Skins
  const topSkin = visualTopPlayer?.skin || "white";
  const bottomSkin = visualBottomPlayer?.skin || "white";

  // Identificar Oponente para Labels y Estado
  const opponent = players.find((p: any) => p.userId !== userId);

  // 4. Texto de Estado
  let statusText = "Conectando...";
  if (isConnected) {
    if (gameState?.status === 'WAITING') statusText = "Esperando oponente...";
    else if (gameState?.status === 'FINISHED') statusText = gameState.winner === userId ? "¡GANASTE!" : "Perdiste";
    else if (gameState?.turnUserId === userId) statusText = "¡TU TURNO!";
    else statusText = `Esperando a ${opponent?.name || 'Rival'}...`;
  }

  // 5. Acción
  const handleRoll = () => {
    if (rolling) return;
    setRolling(true);
    socket.emit("roll_dice", { roomId: room.id, userId });
    setTimeout(() => setRolling(false), 500);
  };

  // ¿Puedo tirar?
  // Solo si estoy conectado, es mi turno, y NO he tirado ya en esta ronda.
  const myRoll = gameState?.rolls?.[userId];
  const canRoll = isConnected && gameState?.status === 'PLAYING' && gameState?.turnUserId === userId && !myRoll;

  return (
    <div className="relative flex flex-col items-center">
      {/* Indicador de conexión discreto */}
      <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_lime]' : 'bg-red-500 animate-pulse'}`} />

      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          topRoll={topRoll}
          bottomRoll={bottomRoll}

          isRollingTop={opponentRolling}
          isRollingBottom={rolling}

          diceColorTop={toSkin(topSkin)}
          diceColorBottom={toSkin(bottomSkin)}

          statusText={statusText}
          winnerDisplay={gameState?.winner ? {
            name: gameState.winner === userId ? "TÚ" : (opponent?.name || "Rival"),
            amount: "$100", // Placeholder
            isTie: gameState.winner === "TIE"
          } : null}

          onRoll={handleRoll}
          canRoll={canRoll}
          timeLeft={30}

          labelTop={visualTopPlayer?.name || "Esperando..."}
          labelBottom={visualBottomPlayer?.name || "Tú"}

          onExit={onLeave}
          onRejoin={onRejoin}
          isFinished={false}
        />
      </div>
    </div>
  );
}

// History Component
export function DiceHistory({ room, swapVisuals, className }: { room: any, swapVisuals?: boolean, className?: string }) {
  const history = room.gameMeta?.history || [];
  // Reverse to show newest first
  const list = [...history].reverse();

  return (
    <div className={`space-y-2 ${className}`}>
      {list.length === 0 && <div className="text-center text-xs text-white/30 py-4">No hay historial reciente</div>}

      {list.map((h: any, i: number) => {
        // Let's just show Winner Name + Damage for now to be safe and simple
        const isTie = !h.winnerUserId;
        const winnerName = room.entries?.find((e: any) => e.user.id === h.winnerUserId)?.user.name || "Desconocido";

        return (
          <div key={i} className="bg-black/20 p-2 rounded flex justify-between items-center text-xs">
            <span className="opacity-50">Ronda {h.round}</span>
            {isTie ? (
              <span className="text-white/50 font-bold">Empate</span>
            ) : (
              <span className="text-emerald-400 font-bold">Ganó {winnerName}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
