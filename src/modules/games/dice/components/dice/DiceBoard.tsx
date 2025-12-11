"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client"; // 🔌 Cliente Socket
import DiceDuel from "@/modules/games/dice/components/DiceDuel";
import { type DiceSkin } from "./ThreeDDice";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAudio } from "@/context/AudioContext";

// Conexión única fuera del componente para evitar reconexiones
let socket: Socket;

const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;
function toSkin(s?: string | null): DiceSkin {
  const allowed = ["white", "green", "blue", "yellow", "red", "purple", "black"];
  return (s && allowed.includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({ room, userId, email, onLeave, onRejoin, onOpenHistory, wheelSize }: any) {
  const router = useRouter();
  const { play } = useAudio();
  const [isConnected, setIsConnected] = useState(false);

  // Estado local sincronizado con el servidor de juegos
  const [gameState, setGameState] = useState<any>(null);
  const [rolling, setRolling] = useState(false);
  const [opponentRolling, setOpponentRolling] = useState(false);

  // Inicializar Socket
  useEffect(() => {
    // 1. Conectar al Game Server (Puerto 4000)
    // Nota: Cambia localhost por tu IP pública si estás en producción, o usa un proxy.
    // Para desarrollo local: http://localhost:4000
    // Para producción (Hostinger): https://tudominio.com/socket (requiere config Nginx) o directo a la IP:4000
    const SOCKET_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://31.187.76.102:4000";

    socket = io(SOCKET_URL, {
      transports: ["websocket"], // Forzar websocket para máxima velocidad
      reconnectionAttempts: 5
    });

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("🟢 Conectado al Motor de Juego");

      // 2. Unirse a la sala
      socket.emit("join_room", {
        roomId: room.id,
        user: {
          id: userId,
          name: room.entries.find((e: any) => e.user.id === userId)?.user.name || "Jugador",
          isBot: false
        }
      });
    });

    // 3. Escuchar actualizaciones (ESTADO OPTIMISTA)
    socket.on("update_game", (data) => {
      setGameState(data);
    });

    socket.on("dice_rolled", ({ userId: rollerId, roll }: any) => {
      play("roll");

      if (rollerId === userId) {
        setRolling(true);
        setTimeout(() => setRolling(false), 800);
      } else {
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

    socket.on("connect_error", (err) => {
      console.error("🔴 Error de conexión:", err);
      toast.error("Error de conexión con el servidor de juego");
    });

    return () => {
      socket.disconnect();
    };
  }, [room.id, userId]);


  // Mapear el estado del socket (gameState) a lo que espera DiceDuel
  // Si gameState es null, usamos la info estática de la DB (room) como fallback
  const players = gameState?.players || {};
  const rolls = gameState?.rolls || {};

  // Identificar quién es P1 y P2 en el socket state
  // (Simplificación: Asumimos que el orden de keys es el orden de llegada)
  const playerKeys = Object.keys(players);
  // Intentar mapear con los entries de la DB para consistencia
  const topEntry = room.entries?.find((e: any) => e.position === 1);
  const bottomEntry = room.entries?.find((e: any) => e.position === 2);

  const dTop = topEntry ? (rolls[topEntry.user.id] || null) : null;
  const dBot = bottomEntry ? (rolls[bottomEntry.user.id] || null) : null;

  // Lógica Visual
  const amTop = topEntry?.user.id === userId;
  const swapVisuals = amTop; // P1 ve abajo

  const timer = gameState?.timer || 30;
  const statusText = gameState?.winner ? `Ganador: ${gameState.winner === userId ? "TÚ" : "RIVAL"}` : "Jugando...";

  // 🚨 FIX: Construir objeto completo para evitar React Error #130
  // Calcular nombre del ganador
  let winnerName = "Rival";
  const wId = gameState?.winner;

  if (wId === userId) winnerName = "TÚ";
  else if (wId && wId !== "TIE") {
    // Buscar en jugadores del socket
    const p = gameState?.players?.find((p: Player) => p.id === wId);
    if (p) winnerName = p.name;
    else {
      // Fallback a room entries
      const entry = room.entries?.find((e: any) => e.user.id === wId);
      if (entry) winnerName = entry.user.name;
    }
  }

  const winnerDisplay = wId ? {
    name: winnerName,
    amount: fmtUSD(room.priceCents || 0),
    isTie: wId === "TIE"
  } : null;

  const handleRoll = () => {
    if (rolling) return;
    socket.emit("roll_dice", { roomId: room.id, userId });
  };

  return (
    <div className="relative flex flex-col items-center">
      {!isConnected && <div className="text-xs text-red-500 mb-2">Conectando al servidor en tiempo real...</div>}

      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          topRoll={swapVisuals ? dBot : dTop}
          bottomRoll={swapVisuals ? dTop : dBot}

          isRollingTop={swapVisuals ? rolling : opponentRolling}
          isRollingBottom={swapVisuals ? opponentRolling : rolling}

          statusText={statusText}
          winnerDisplay={winnerDisplay}

          onRoll={handleRoll}
          canRoll={!rolling && !dTop /* Simplificado para test */}
          timeLeft={timer}

          labelTop={swapVisuals ? "J2" : "J1"}
          labelBottom="Tú"
          diceColorTop="white"
          diceColorBottom="white"

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
        // h has: rolls: { userId: [1,2] }, winnerUserId, round...
        // We need to map userId to Top/Bottom based on swapVisuals? 
        // Or just show simplified view.

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
