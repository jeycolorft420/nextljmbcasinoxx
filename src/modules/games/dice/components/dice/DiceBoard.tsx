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
    // 1. Determinar URL del Socket
    // Si estamos en producción (https), intentamos usar el mismo dominio (proxy nginx)
    // Si hay variable de entorno, tiene prioridad.
    // Default fallback: IP directa (solo dev/testing sin SSL)
    const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';

    let SOCKET_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

    if (!SOCKET_URL) {
      if (isProduction) {
        // En Producción con HTTPS, usamos ruta relativa "/" 
        // Esto asume que Nginx redirige /socket.io -> localhost:4000
        SOCKET_URL = undefined;
      } else {
        // Dev / Fallback
        SOCKET_URL = "http://31.187.76.102:4000";
      }
    }

    // console.log("🔌 Conectando a:", SOCKET_URL || "Mismo Dominio");

    socket = io(SOCKET_URL || window.location.origin, {
      path: "/socket.io", // Ruta estándar
      // transports: ["websocket"], // ⚡ COMENTADO: Dejar que negocie (Polling -> WS) para mayor compatibilidad
      reconnectionAttempts: 10,
      secure: isProduction,
      rejectUnauthorized: false
    });

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("🟢 Conectado al Motor de Juego", socket.id);
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
      console.log("📥 UPDATE GAME RECIBIDO:", data);
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

    // WATCHDOG: Si en 2s no recibimos estado, pedir unir de nuevo
    const watchdog = setTimeout(() => {
      if (!socket.connected) return;
      console.warn("🐶 Watchdog: No se recibió estado, reintentando unir...");
      socket.emit("join_room", {
        roomId: room.id,
        user: {
          id: userId,
          name: room.entries.find((e: any) => e.user.id === userId)?.user.name || "Jugador",
          isBot: false
        }
      });
    }, 2000);

    return () => {
      clearTimeout(watchdog);
      socket.disconnect();
    };
  }, [room.id, userId]);


  // Mapear el estado del socket (gameState) a lo que espera DiceDuel
  // players es ahora un array [{userId: "...", name: "..."}]
  const playersArr = Array.isArray(gameState?.players) ? gameState.players : [];
  const rolls = gameState?.rolls || {};

  // Mapeo DIRECTO del Socket (La verdad absoluta)
  // P1 = Index 0, P2 = Index 1
  const p1 = playersArr[0] || null;
  const p2 = playersArr[1] || null;

  // Determinar quién soy yo en el array del socket
  const amP1 = p1?.userId === userId;
  const amP2 = p2?.userId === userId;

  // Si soy P1, veo P2 arriba. Si soy P2, veo P1 arriba.
  // Si soy espectador, veo P1 arriba normal.
  const swapVisuals = amP1; // Si soy P1, quiero verme abajo (Bottom), así que P2 va arriba (Top)

  const topPlayer = swapVisuals ? p2 : p1;
  const botPlayer = swapVisuals ? p1 : p2;

  // Obtener Dados usando los IDs del socket
  const dTop = topPlayer ? (rolls[topPlayer.userId] || null) : null;
  const dBot = botPlayer ? (rolls[botPlayer.userId] || null) : null;

  // Nombres para mostrar
  const labelTop = topPlayer?.name || (swapVisuals ? "J2" : "J1");
  const labelBot = botPlayer?.name || (swapVisuals ? "Tú" : "J2");

  const timer = gameState?.timer || 30;
  // Identificar el usuario actual
  // Nota: players es array o objeto? En el nuevo server es array.
  // Pero aquí mantuvimos la lógica vieja de objeto {id: roll}.
  // El nuevo server manda room.players array.
  // Vamos a adaptar para leer turnUserId.

  // VALIDACIÓN DE TURNO
  const myTurn = gameState?.turnUserId === userId;
  const isWinner = !!gameState?.winner;

  // Status Text Inteligente
  let statusText = "Esperando jugadores...";
  if (gameState?.status === 'WAITING') statusText = "Esperando oponente...";
  else if (gameState?.winner) statusText = gameState.winner === userId ? "¡GANASTE!" : (gameState.winner === "TIE" ? "EMPATE" : "Rival Ganó");
  else if (myTurn) statusText = "¡TU TURNO! TIRA LOS DADOS";
  else statusText = `Esperando a ${gameState?.turnUserId === "bot-juan" ? "Bot" : "Rival"}...`;

  // 🚨 FIX: Construir objeto completo para evitar React Error #130
  // Calcular nombre del ganador
  let winnerName = gameState?.winner === "TIE" ? "EMPATE" : "Rival";
  const wId = gameState?.winner;

  if (wId === userId) winnerName = "TÚ";
  else if (wId && wId !== "TIE") {
    // Buscar en jugadores del socket (Array en nuevo server)
    const p = gameState?.players?.find((p: any) => p.userId === wId);
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
          canRoll={!rolling && myTurn && !isWinner}
          timeLeft={timer}

          labelTop={labelTop}
          labelBottom={labelBot}
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
