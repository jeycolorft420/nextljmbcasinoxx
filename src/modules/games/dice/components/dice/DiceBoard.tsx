"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import DiceDuel from "../DiceDuel";

const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:4000";

// Mapas de dados para mostrar iconos (opcional, o usar números)
const DICE_ICONS = ["?", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

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
  history: any[];
  players: Player[];
  winnerId?: string;
  reason?: string; // Por si hay victoria por "TIME_OUT" o "FORFEIT"
}

export default function DiceBoard({ roomId, user, onHistoryUpdate }: { roomId: string; user: any; onHistoryUpdate?: (h: any[]) => void }) {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [animRolls, setAnimRolls] = useState<{ [key: string]: boolean }>({});
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  useEffect(() => {
    // Lógica de conexión automática
    let connectionUrl: string | undefined = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

    // Si no hay variable de entorno, autodetectar:
    if (!connectionUrl) {
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        // En producción (VPS/Vercel), usar la misma url base (Nginx manejará /socket.io)
        connectionUrl = undefined;
      } else {
        // En local
        connectionUrl = "http://localhost:4000";
      }
    }

    const socket = io(connectionUrl || undefined, {
      path: "/socket.io",
      transports: ["websocket", "polling"], // Intentar polling si websocket falla
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Conectado al servidor de juegos");
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
      console.error("❌ Error de conexión:", err.message);
    });

    socket.on("update_game", (state: GameState) => {
      setGameState(state);

      // Pasar historial al padre si existe
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

    socket.on("game_over", ({ winnerId, prize, reason }: any) => {
      if (winnerId === user.id) {
        toast.success(`¡Ganaste $${(prize / 100).toFixed(2)}!`, { description: reason === 'TIME_OUT' ? 'Por tiempo' : '¡Bien jugado!' });
        new Audio("/sfx/win.mp3").play().catch(() => { });
      } else {
        toast.error("Has perdido esta vez.");
      }
    });

    return () => { socket.disconnect(); };
  }, [roomId, user]);

  if (!gameState) return <div className="text-white/50 text-center mt-20 flex flex-col items-center gap-2"><span className="loading loading-spinner"></span>Conectando al servidor...</div>;

  const me = gameState.players.find(p => p.userId === user.id);
  const opponent = gameState.players.find(p => p.userId !== user.id);
  const isMyTurn = gameState.status === 'PLAYING' && gameState.turnUserId === user.id;
  const topRoll = opponent ? gameState.rolls[opponent.userId] : null;
  const bottomRoll = me ? gameState.rolls[me.userId] : null;

  return (
    <div className="w-full h-full bg-[#050505] flex flex-col items-center justify-center relative">

      {/* CARTEL DE GANADOR DE RONDA */}
      {gameState.status === 'ROUND_END' && roundWinner && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-gradient-to-b from-[#1a1a1a] to-black p-1 rounded-2xl shadow-2xl border border-white/10 transform scale-110">
            <div className="bg-black/80 rounded-xl px-12 py-8 text-center border border-white/5">
              <h2 className="text-emerald-500 font-bold text-xs uppercase tracking-[0.3em] mb-4">Resultado Ronda {gameState.round}</h2>

              <div className="text-4xl md:text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] mb-2">
                {roundWinner === "Empate" ? "🤝 EMPATE" : <span>🏆 {roundWinner}</span>}
              </div>

              <div className="mt-6 flex justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 rounded-full bg-white/20 animate-bounce" style={{ animationDelay: '0.4s' }} />
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

        statusText={
          gameState.status === 'ROUND_END' ? "" : // Ocultar si hay cartel
            gameState.status === 'WAITING' ? "Esperando Oponente..." :
              gameState.status === 'FINISHED' ? (gameState.reason === 'TIME_OUT' ? "Victoria por Tiempo" : "Partida Terminada") :
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

      {/* COMPONENTE DE HISTORIAL FLOTANTE PARA ESCRITORIO */}
      {/* (El de móvil se renderiza en page.tsx usando DiceHistory exportado abajo) */}
      <div className="hidden lg:block absolute top-4 left-4 z-40">
        <DiceHistory room={gameState} />
      </div>
    </div>
  );
}

// --- COMPONENTE DE HISTORIAL MEJORADO ---
export const DiceHistory = ({ room }: { room: any }) => {
  const history = room?.history || [];
  const players = room?.players || [];

  if (!history || history.length === 0) return (
    <div className="p-4 text-center opacity-30 text-xs bg-white/5 rounded-lg border border-white/5">
      Sin historial aún
    </div>
  );

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 w-64 max-h-[300px] overflow-y-auto custom-scrollbar shadow-xl">
      <h4 className="font-bold text-white/80 text-[10px] uppercase tracking-wider mb-3 border-b border-white/10 pb-2 flex justify-between">
        <span>Ronda</span>
        <span>Resultado</span>
      </h4>
      <div className="space-y-2">
        {[...history].reverse().map((h, i) => {
          // Encontrar nombre del ganador
          const winnerName = players.find((p: any) => p.userId === h.winnerId)?.name;
          const isTie = !h.winnerId;

          // Formatear dados (User 1 vs User 2)
          const userIds = Object.keys(h.rolls || {});
          const p1 = players.find((p: any) => p.userId === userIds[0]);
          const p2 = players.find((p: any) => p.userId === userIds[1]);

          const roll1 = h.rolls[p1?.userId] || [0, 0];
          const roll2 = h.rolls[p2?.userId] || [0, 0];

          const sum1 = roll1[0] + roll1[1];
          const sum2 = roll2[0] + roll2[1];

          return (
            <div key={i} className={`flex flex-col text-xs p-2 rounded-lg border ${isTie ? 'bg-white/5 border-white/5' : 'bg-[#0a0a0a] border-white/5'}`}>
              {/* Cabecera Ronda */}
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono text-white/40">#{h.round}</span>
                <span className={`font-bold ${isTie ? "text-yellow-500" : "text-emerald-400"}`}>
                  {isTie ? "EMPATE" : winnerName}
                </span>
              </div>

              {/* Detalles de Dados */}
              {p1 && p2 && (
                <div className="flex justify-between items-center text-[10px] text-white/60 bg-black/20 p-1 rounded">
                  <div className="flex items-center gap-1">
                    <span className="text-white/30">{p1.name.substring(0, 6)}:</span>
                    <span className="text-white font-mono">{DICE_ICONS[roll1[0]]}{DICE_ICONS[roll1[1]]} ({sum1})</span>
                  </div>
                  <div className="text-white/20">vs</div>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-mono">{DICE_ICONS[roll2[0]]}{DICE_ICONS[roll2[1]]} ({sum2})</span>
                    <span className="text-white/30">:{p2.name.substring(0, 6)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  );
};
