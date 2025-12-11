"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";
import DiceDuel from "@/modules/games/dice/components/DiceDuel";
import { type DiceSkin } from "./ThreeDDice";
import { toast } from "sonner";
import { useAudio } from "@/context/AudioContext";
import confetti from "canvas-confetti";

// Types matching Server
type Player = {
  id: string;
  name: string;
  isBot: boolean;
  balance: number;
  position: number;
  color?: string;
};

type GameState = {
  state: "OPEN" | "LOCKED" | "FINISHED" | "RESOLVING";
  currentRound: number;
  players: Player[];
  rolls: Record<string, number[]>;
  lastDice: Record<string, number[]>;
  roundStartedAt: number;
  history: any[];
  winner?: any;
  timer: number;
};

type Props = {
  room: any; // We still get initial room data from page
  userId: string | null;
  email?: string | null;
  onLeave: () => Promise<void>;
  onRejoin: () => Promise<void>;
  wheelSize: number;
};
const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;
function toSkin(s?: string | null): DiceSkin {
  const allowed = ["white", "green", "blue", "yellow", "red", "purple", "black"];
  return (s && allowed.includes(s)) ? (s as DiceSkin) : "white";
}

export default function DiceBoard({ room, userId, email, onLeave, onRejoin, wheelSize }: Props) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { play } = useAudio();
  const router = useRouter();

  // Init Socket
  useEffect(() => {
    if (!userId) return;

    // Connect to Game Server on Port 3001
    const s = io("http://localhost:3001", {
      query: { userId, roomId: room.id, autoJoin: "true" }
    });

    s.on("connect", () => {
      console.log("Connected to Game Server");
    });

    s.on("game_state", (state: GameState) => {
      setGameState(state);
      // Sync router if finished?
      if (state.state === "FINISHED") {
        play("win");
        confetti({ particleCount: 150, spreed: 70, origin: { y: 0.6 } });
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [userId, room.id]);

  // Handle Roll
  const handleRoll = () => {
    if (socket) {
      play("roll");
      socket.emit("roll", { roomId: room.id, userId });
    }
  };

  if (!gameState) return <div className="text-center p-10">Connecting to Game Server...</div>;

  // Map State to Visuals
  const me = gameState.players.find(p => p.id === userId);
  const opponent = gameState.players.find(p => p.id !== userId);
  const amTop = me?.position === 1; // Or check persistent if needed

  // Determine visual swap (P1 always bottom?)
  // Let's stick to Server Position logic: P1 is Top, P2 is Bottom usually? 
  // Wait, in previous logic "swapVisuals = amTop" -> If I am Top (P1), I swap so I appear at Bottom.

  // Server: P1 (Pos 1), P2 (Pos 2).
  // If I am P1:
  //   Visually I want to be Bottom.
  //   So Bottom Component = Me (P1).
  //   Top Component = Opponent (P2).

  // If I am P2:
  //   Visually I want to be Bottom.
  //   So Bottom Component = Me (P2).
  //   Top Component = Opponent (P1).

  // Data for Bottom (Me)
  const bottomPlayer = me;
  const topPlayer = opponent;

  // Rolls
  const rolls = gameState.rolls;
  const lastDice = gameState.lastDice;
  const isLock = gameState.state === "RESOLVING" || gameState.state === "FINISHED";

  // If Locked/Resolving, show Rolls OR Last Dice
  // Actually, rolls persists until next round.
  const bottomRoll = rolls[me?.id || ""] || (isLock ? lastDice[me?.id || ""] : null);
  const topRoll = rolls[opponent?.id || ""] || (isLock ? lastDice[opponent?.id || ""] : null);

  return (
    <div className="relative flex flex-col items-center">
      <div className="w-full mx-auto relative" style={{ maxWidth: wheelSize }}>
        <DiceDuel
          topRoll={topRoll}
          bottomRoll={bottomRoll}

          isRollingTop={false} // Todo: Add rolling state from server events?
          isRollingBottom={false}

          statusText={gameState.state === "LOCKED" && !rolls[userId || ""] ? "¡TU TURNO!" : ""}
          winnerDisplay={null} // TODO: Map winner from history

          onRoll={handleRoll}
          canRoll={gameState.state === "LOCKED" && !rolls[userId || ""]}

          labelTop={topPlayer?.name || "Esperando..."}
          labelBottom={bottomPlayer?.name || "Tú"}

          diceColorTop={toSkin(topPlayer?.color)}
          diceColorBottom={toSkin(bottomPlayer?.color)}

          balanceTop={fmtUSD(topPlayer?.balance || 0)}
          balanceBottom={fmtUSD(bottomPlayer?.balance || 0)}

          onExit={onLeave}
          onRejoin={onRejoin}
          isFinished={gameState.state === "FINISHED"}
        />
      </div>

      {/* Debug Info */}
      <div className="text-xs text-white/30 mt-2">
        Server State: {gameState.state} | Round: {gameState.currentRound}
      </div>
    </div>
  );
}
