"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import RouletteBoard from "@/modules/games/roulette/components/RouletteBoard";
import DiceBoard, { DiceHistory } from "@/modules/games/dice/components/dice/DiceBoard";
import RoomHistoryList from "@/modules/rooms/components/RoomHistoryList";
import { pusherClient } from "@/modules/ui/lib/pusher-client";
import ChatBubble from "@/modules/rooms/components/chat/ChatBubble";
import ChatWindow from "@/modules/rooms/components/chat/ChatWindow";
import { useWallet } from "@/hooks/use-wallet";
import { toast } from "sonner";
import BuySeatUI from "@/modules/rooms/components/BuySeatUI";
import ConfirmationModal from "@/modules/ui/components/ConfirmationModal";
import { useLicense } from "@/context/LicenseContext";
import ThemeSelector from "@/modules/games/roulette/components/ThemeSelector";
import DiceSkinSelector from "@/modules/games/dice/components/DiceSkinSelector";
import { io, Socket } from "socket.io-client";

const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:4000";

type Entry = {
  id: string;
  position: number;
  user: { id: string; name: string | null; email: string };
};

type GameType = "ROULETTE" | "DICE_DUEL";

type Room = {
  id: string;
  title: string;
  priceCents: number;
  state: "OPEN" | "LOCKED" | "FINISHED";
  capacity: number;
  createdAt: string;
  lockedAt: string | null;
  finishedAt: string | null;
  prizeCents?: number | null;
  winningEntryId?: string | null;
  entries?: Entry[];
  gameType: GameType;
  gameMeta?: any | null;
  currentRound?: number;
};

function stateBadgeClass(s: Room["state"] | undefined) {
  if (s === "OPEN") return "badge badge-success";
  if (s === "LOCKED") return "badge badge-warn";
  if (s === "FINISHED") return "badge badge-info";
  return "badge";
}

export default function RoomPage() {
  const { features } = useLicense();
  const { id } = useParams<{ id: string }>();
  const { data: session, update: updateSession } = useSession();
  const email = session?.user?.email ?? null;
  const userId = (session?.user as any)?.id ?? null;

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadHistoryKey, setReloadHistoryKey] = useState(0);

  // compra múltiple
  const [qty, setQty] = useState(1);
  const [joining, setJoining] = useState(false);

  // ESTADO DEL JUEGO (Centralizado)
  const [gameState, setGameState] = useState<any>(null); // Estado en vivo del Socket
  const socketRef = useRef<Socket | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "neutral";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
    variant: "neutral",
  });

  const closeConfirm = () => setConfirmModal((prev) => ({ ...prev, isOpen: false }));

  // selección manual
  const [selectedPositions, setSelectedPositions] = useState<number[]>([]);

  // Cuenta regresiva
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // THEME STATE
  const [currentTheme, setCurrentTheme] = useState("default");
  const [themeSelectorOpen, setThemeSelectorOpen] = useState(false);

  // DICE SKIN STATE
  const [currentDiceSkin, setCurrentDiceSkin] = useState("white");
  const [diceSelectorOpen, setDiceSelectorOpen] = useState(false);

  // --- JOIN ---
  const { optimisticUpdate, rollbackUpdate, balanceCents: walletBalance } = useWallet();
  const userBalanceCents = walletBalance ?? (session?.user as any)?.balanceCents ?? 0;

  // Extract skins
  const ownedSkins: string[] = useMemo(() => {
    const u = session?.user as any;
    const skins = u?.rouletteSkins || [];
    const cleanNames = skins.map((s: any) => typeof s === 'string' ? s : s.definitionId || s.skinId || s.name || s.id);
    return Array.from(new Set(["default", ...cleanNames]));
  }, [session]);

  const ownedDiceSkins: string[] = useMemo(() => {
    const u = session?.user as any;
    const skins = u?.diceSkins || [];
    const cleanNames = skins.map((s: any) => typeof s === 'string' ? s : s.color);
    return Array.from(new Set(["white", ...cleanNames]));
  }, [session]);

  useEffect(() => {
    if (session?.user) {
      if ((session.user as any).selectedRouletteSkin) {
        setCurrentTheme((session.user as any).selectedRouletteSkin);
      }
      if ((session.user as any).selectedDiceColor) {
        setCurrentDiceSkin((session.user as any).selectedDiceColor);
      }
    }
  }, [session]);

  const handleThemeChange = async (skin: string) => {
    setCurrentTheme(skin);
    try {
      const res = await fetch("/api/me/skin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skin })
      });
      if (res.ok) {
        toast.success(`Tema actualizado: ${skin.toUpperCase()}`);
        updateSession();
      } else {
        toast.error("Error al guardar skin");
      }
    } catch {
      toast.error("Error de red");
    }
  };

  const handleDiceSkinChange = async (skin: string) => {
    setCurrentDiceSkin(skin);
    try {
      const res = await fetch("/api/shop/buy-skin", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: skin })
      });
      if (res.ok) {
        toast.success(`Dados: ${skin.toUpperCase()}`);
        updateSession();
      } else {
        const d = await res.json();
        toast.error(d.error || "No se pudo cambiar");
      }
    } catch {
      toast.error("Error de red");
    }
  };

  // tamaño
  const [wheelSize, setWheelSize] = useState(320);
  useEffect(() => {
    const compute = () => {
      const w = Math.min(360, Math.max(260, Math.floor(window.innerWidth * 0.85)));
      setWheelSize(w);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // métricas
  const currentEntries = useMemo(() => {
    return room?.entries?.filter((e: any) => (e.round ?? 1) === (room.currentRound ?? 1)) ?? [];
  }, [room?.entries, room?.currentRound]);

  const taken = currentEntries.length;
  const free = room ? Math.max(0, room.capacity - taken) : 0;

  // Mobile Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showMobileBuy, setShowMobileBuy] = useState(true);

  // Carga inicial
  const load = async (): Promise<Room | null> => {
    if (!id) return null;
    setLoading((v) => (!room ? true : v));
    try {
      const res = await fetch(`/api/rooms/${id}`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as Room;
      setRoom(data);
      setReloadHistoryKey(n => n + 1);

      const libres = Math.max(0, data.capacity - (data.entries?.length ?? 0));
      setQty((q) => Math.min(Math.max(1, q), Math.max(1, libres)));

      const occupied = new Set((data.entries ?? []).map((e) => e.position));
      setSelectedPositions((prev) => prev.filter((p) => !occupied.has(p)));
      return data;
    } catch (err) {
      console.error("load error", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleRoomUpdate = (payload: Room) => {
    setRoom((prev) => {
      if (prev) {
        const historyChanged = (prev.gameMeta?.history?.length ?? 0) !== (payload.gameMeta?.history?.length ?? 0);
        const roundChanged = prev.currentRound !== payload.currentRound;
        const finishedNow = prev.state !== "FINISHED" && payload.state === "FINISHED";

        if (historyChanged || roundChanged || finishedNow) {
          setReloadHistoryKey(n => n + 1);
        }
      }
      if (JSON.stringify(prev) === JSON.stringify(payload)) return prev;
      return payload;
    });

    const occupied = new Set((payload.entries ?? []).map((e) => e.position));
    setSelectedPositions((prev) => prev.filter((p) => !occupied.has(p)));
  };

  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (room?.state !== "FINISHED") {
      setShowResults(false);
    }
  }, [room?.currentRound, room?.state]);

  const handleSpinEnd = () => {
    setShowResults(true);
    setReloadHistoryKey(n => n + 1);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!room) { setCountdownSeconds(null); return; }
    const updateCountdown = () => {
      if (room.state === "FINISHED" && room.finishedAt && room.gameType === "ROULETTE") {
        const finishTime = new Date(room.finishedAt).getTime();
        const diff = Date.now() - finishTime;
        const RESET_DELAY_MS = 20000;
        const remaining = Math.max(0, Math.ceil((RESET_DELAY_MS - diff) / 1000));
        setCountdownSeconds(remaining);
        if (diff >= RESET_DELAY_MS) {
          fetch(`/api/rooms/${id}/reset`, { method: "POST" }).catch(e => console.error("Reset failed", e));
        }
        return;
      }
      if (room.state === "OPEN" && room.lockedAt) {
        const lockTime = new Date(room.lockedAt).getTime();
        const diff = lockTime - Date.now();
        const remaining = Math.max(0, Math.ceil(diff / 1000));
        setCountdownSeconds(remaining);
        return;
      }
      setCountdownSeconds(null);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [room?.state, room?.finishedAt, room?.lockedAt, room?.gameType, id]);

  // Pusher
  useEffect(() => {
    if (!id) return;
    const channelName = `private-room-${id}`;
    const channel = pusherClient.subscribe(channelName);
    const onUpdate = (evt: any) => {
      if (evt.refresh) {
        fetch(`/api/rooms/${id}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) handleRoomUpdate(data); });
      } else {
        handleRoomUpdate(evt as Room);
      }
    };
    channel.bind("room:update", onUpdate);
    return () => { channel.unbind("room:update", onUpdate); pusherClient.unsubscribe(channelName); };
  }, [id]);

  // SOCKET CENTRALIZADO
  useEffect(() => {
    if (!userId || !room || room.gameType !== 'DICE_DUEL') return;

    let url: string | undefined = GAME_SERVER_URL;
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      url = undefined; // Usar path relativo en producción
    }

    const socket = io(url, {
      path: "/socket.io",
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_room", { roomId: id, user: { id: userId, name: session?.user?.name, avatar: session?.user?.image, selectedDiceColor: (session?.user as any)?.selectedDiceColor } });
    });

    socket.on("update_game", (data) => setGameState(data));

    socket.on("dice_anim", (data) => {
      setGameState((prev: any) => ({ ...prev, lastRoll: data }));
    });

    socket.on("game_over", (data: any) => {
      if (data.winnerId === userId) toast.success(data.reason === 'TIMEOUT' ? "¡Ganaste por tiempo!" : "¡Ganaste!");
      else toast.error(data.reason === 'TIMEOUT' ? "Tiempo agotado" : "Perdiste");
    });

    socket.on("server:room:reset", () => {
      console.log("🔥 HARD RESET: Limpiando tablero visualmente...");
      toast.info("La sala se ha reiniciado.");

      // FORZAR LIMPIEZA VISUAL EXTRAMA
      setGameState(null);
      setTimeout(() => {
        setGameState({
          status: 'WAITING',
          round: 1,
          players: [],
          rolls: {},
          history: [],
          timeLeft: 30
        });
      }, 50);
    });

    socket.on('game:hard_reset', () => {
      console.log("nuclear: Recibido HARD RESET. Limpiando tablero...");
      setGameState(null);
      toast.error("La sala se ha reiniciado por completo.");
      setTimeout(() => {
        setGameState({
          status: 'WAITING',
          round: 1,
          players: [],
          rolls: {},
          history: [],
          timeLeft: 30
        });
      }, 50);
    });

    return () => { socket.disconnect(); };
  }, [id, userId, room?.gameType]);

  const handleRoll = () => {
    socketRef.current?.emit("roll_dice", { roomId: id });
  };

  const togglePosition = (pos: number) => {
    if (!room || room.state !== "OPEN") return;
    const occupied = new Set((room.entries ?? []).map((e) => e.position));
    if (occupied.has(pos)) return;
    setSelectedPositions((prev) => {
      if (prev.includes(pos)) return prev.filter((p) => p !== pos);
      if (prev.length >= free) return prev;
      return [...prev, pos].sort((a, b) => a - b);
    });
  };

  useEffect(() => {
    if (selectedPositions.length > 0 && qty < selectedPositions.length) setQty(selectedPositions.length);
  }, [selectedPositions.length, qty]);

  const join = async () => {
    if (!id) return;
    const costCents = room ? room.priceCents * ((selectedPositions.length > 0 ? selectedPositions.length : qty)) : 0;
    const currentBalance = walletBalance ?? (session?.user as any)?.balanceCents ?? 0;

    if (currentBalance < costCents) {
      toast.error("Saldo insuficiente", { description: "Recarga tu wallet para jugar." });
      return;
    }

    setJoining(true);
    optimisticUpdate(-costCents);

    const oldSelection = [...selectedPositions];
    let revertRoom: Room | null = null;

    if (room && session?.user && selectedPositions.length > 0) {
      revertRoom = { ...room };
      const newEntries = selectedPositions.map((pos) => ({
        id: `temp-${pos}-${Date.now()}`,
        position: pos,
        round: room.currentRound ?? 1,
        user: { id: (session.user as any)?.id || "me", name: session.user?.name || "Yo", email: session.user?.email! }
      }));
      setRoom((prev) => {
        if (!prev) return prev;
        const others = (prev.entries || []).filter(e => !selectedPositions.includes(e.position));
        return { ...prev, entries: [...others, ...newEntries] };
      });
      setSelectedPositions([]);
    }

    try {
      const payload = selectedPositions.length > 0 ? { positions: selectedPositions } : { quantity: qty };
      const res = await fetch(`/api/rooms/${id}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        rollbackUpdate(costCents);
        if (revertRoom) setRoom(revertRoom);
        if (oldSelection.length > 0) setSelectedPositions(oldSelection);
        toast.error(data.error || "No se pudo unir");
      } else {
        const takenList = Array.isArray(data.positions) ? data.positions : [];
        if (oldSelection.length === 0 && takenList.length > 0 && room && session?.user) {
          const newEntries = takenList.map((pos: number) => ({
            id: `temp-${pos}-${Date.now()}`, position: pos, round: room.currentRound ?? 1,
            user: { id: (session.user as any)?.id || "me", name: session.user?.name || "Yo", email: session.user?.email! }
          }));
          setRoom((prev) => {
            if (!prev) return prev;
            const others = (prev.entries || []).filter(e => !takenList.includes(e.position));
            return { ...prev, entries: [...others, ...newEntries] };
          });
        }
        toast.success("¡Unido!");

        // ✅ SOLUCIÓN REAL-TIME: Avisar al socket inmediatamente
        await load(); // 1. Recargar datos de la sala
        if (socketRef.current && userId) {
          console.log("💰 Compra detectada, actualizando socket...");
          socketRef.current.emit("join_room", {
            roomId: id,
            user: {
              id: userId,
              name: session?.user?.name,
              avatar: session?.user?.image,
              selectedDiceColor: (session?.user as any)?.selectedDiceColor
            }
          });
        }

        setTimeout(() => { load().then(d => { if (d) handleRoomUpdate(d); }); }, 500);
      }
    } catch {
      rollbackUpdate(costCents);
      if (revertRoom) setRoom(revertRoom);
      if (oldSelection.length > 0) setSelectedPositions(oldSelection);
      toast.error("Error de red");
    } finally {
      setJoining(false);
    }
  };

  const handleForfeit = async (skipConfirm = false) => {
    if (!id || room?.gameMeta?.ended) return;
    const fn = async () => { await fetch(`/api/rooms/${id}/forfeit`, { method: "POST", headers: { "Content-Type": "application/json" } }); };
    if (skipConfirm) fn();
    else setConfirmModal({ isOpen: true, title: "Rendirse", message: "¿Rendirse?", onConfirm: () => { fn(); closeConfirm(); }, variant: "danger" });
  };
  const handleLeave = async () => {
    if (!id) return;
    const isParticipant = room?.entries?.some(e => e.user.email === email);
    if (!isParticipant) { window.location.href = "/rooms"; return; }
    setConfirmModal({
      isOpen: true, title: "Abandonar", message: "¿Seguro?",
      onConfirm: async () => {
        const r = await fetch(`/api/rooms/${id}/leave`, { method: "POST" });
        if (r.ok) window.location.href = "/rooms";
        else toast.error("Error al salir");
        closeConfirm();
      }, variant: "danger"
    });
  };
  const handleBackToLobby = () => {
    const isParticipant = room?.entries?.some(e => e.user.email === email);
    if (isParticipant) handleLeave();
    else window.location.href = "/rooms";
  };
  const handleRejoin = async () => {
    if (!id) return;
    if (room?.state === "FINISHED") {
      try {
        await fetch(`/api/rooms/${id}/reset`, { method: "POST" });
        socketRef.current?.emit("request_reset", { roomId: id }); // 🔥 Forzar reset en socket server
      } catch (e) {
        toast.error("Error al reiniciar la sala");
        return;
      }
    }
    await fetch(`/api/rooms/${id}/leave`, { method: "POST" }).catch(() => { });
    await fetch(`/api/rooms/${id}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: 1 }),
    }).catch(() => {
      toast.error("Error al entrar");
    });
  };

  if (loading && !room) return <div className="text-center mt-10 opacity-50">Cargando...</div>;
  if (!room) return <div className="text-center mt-10">Sala no encontrada</div>;

  // --- SAFE USER OBJECT FOR DICE BOARD ---
  const safeUser = session?.user ? {
    id: userId || "guest",
    name: session.user.name || "Jugador",
    image: session.user.image || "",
    selectedDiceColor: currentDiceSkin
  } : { id: "guest", name: "Invitado", image: "", selectedDiceColor: "white" };

  const renderSeats = () => (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: room.capacity }).map((_, i) => {
        const pos = i + 1;
        const entry = currentEntries.find((e: any) => e.position === pos);
        const occupied = !!entry;
        const isMine = entry?.user.email === email;
        const isSelected = selectedPositions.includes(pos);
        const isWinner = showResults && !!room.winningEntryId && entry?.id === room.winningEntryId;
        const canToggle = room.state === "OPEN" && !occupied;

        return (
          <button
            key={pos}
            onClick={() => canToggle && togglePosition(pos)}
            className={`rounded-md border p-1 text-[10px] h-12 flex flex-col items-center justify-center relative overflow-hidden transition-all
                ${isWinner ? "border-green-500 bg-green-500/20 shadow-[0_0_10px_lime]"
                : isSelected ? "border-blue-400 bg-blue-600/30 text-white"
                  : isMine ? "border-purple-500 bg-purple-500/20"
                    : occupied ? "border-white/5 bg-white/5 opacity-50 grayscale"
                      : "border-white/10 opacity-70 hover:bg-white/10"}
                ${canToggle ? "active:scale-95" : ""}`}
          >
            <span className="font-bold opacity-50 text-[8px]">#{pos}</span>
            {entry ? (
              <span className={`truncate w-full text-center font-medium ${isMine ? "text-purple-300" : ""}`}>{entry.user.name || "..."}</span>
            ) : (
              <span className="opacity-30">Libre</span>
            )}
            {isWinner && <div className="absolute top-0 right-0 bg-green-500 text-black text-[7px] px-1 font-bold">WIN</div>}
          </button>
        );
      })}
    </div>
  );

  return (
    <main className="fixed inset-0 z-[200] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-[#050505] to-black text-white overflow-hidden flex flex-col sm:static sm:z-auto sm:bg-transparent sm:block sm:max-w-[1400px] sm:mx-auto sm:space-y-4 sm:px-2 sm:pb-4">
      {/* MOBILE TOP BAR */}
      <div className="sm:hidden h-16 px-4 flex items-center justify-between z-[210] bg-gradient-to-b from-black/90 to-transparent shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={handleBackToLobby} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md text-white/90">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          {countdownSeconds !== null && (
            <div className="px-3 py-1 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-full text-xs font-mono font-bold animate-pulse">
              {countdownSeconds}s
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {walletBalance !== null && (
            <div className="flex flex-col items-end leading-none">
              <span className="text-[10px] opacity-50 uppercase font-bold tracking-wider">Saldo</span>
              <span className="text-sm font-bold text-emerald-400">${(walletBalance / 100).toFixed(2)}</span>
            </div>
          )}
          {room.gameType === "ROULETTE" && (
            <button onClick={() => setThemeSelectorOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md text-white/80">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
            </button>
          )}
          {room.gameType === "DICE_DUEL" && (
            <button onClick={() => setDiceSelectorOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md text-white/80">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M8 8h.01" /><path d="M12 12h.01" /><path d="M16 16h.01" /></svg>
            </button>
          )}
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md text-white/80">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* MOBILE CENTER STAGE */}
      <div className="flex-1 flex flex-col sm:hidden relative overflow-hidden">
        <div className="flex justify-between px-6 py-2 text-xs font-mono opacity-60">
          <span>R#{room.currentRound ?? 1}</span>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${room ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className={stateBadgeClass(room.state)}>{room.state}</span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center relative w-full px-4">
          {room.gameType === "DICE_DUEL" ? (
            <div className="relative z-10 w-full max-w-md h-full">
              <DiceBoard
                gameState={gameState}
                userId={safeUser.id}
                onRoll={handleRoll}
                onReset={handleRejoin}
              />
            </div>
          ) : (
            <div className="relative z-10 transition-all duration-500" style={{ width: wheelSize, height: wheelSize }}>
              <RouletteBoard room={room} email={email} wheelSize={wheelSize} theme={currentTheme} onSpinEnd={handleSpinEnd} />
            </div>
          )}

          <button
            onClick={() => setHistoryOpen(true)}
            className="absolute left-6 bottom-4 p-3 z-20 bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 rounded-full backdrop-blur-md shadow-lg active:scale-95 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </button>
        </div>

        {showResults && room.state === "FINISHED" && room.gameType === "ROULETTE" && (
          <div className="absolute bottom-24 left-4 right-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-center animate-in slide-in-from-bottom duration-300 z-30">
            <h3 className="text-primary font-bold">¡Ronda Finalizada!</h3>
            <p className="text-white text-lg font-bold mt-1">
              🏆 {room.entries?.find(e => e.id === room.winningEntryId)?.user.name || "Ganador"}
            </p>
            <p className="text-xs opacity-50 font-mono mt-2">{countdownSeconds ? `Reiniciando… ${countdownSeconds}s` : "Reiniciando..."}</p>
          </div>
        )}
        <div className="h-16 shrink-0" />
      </div>

      <ThemeSelector isOpen={themeSelectorOpen} onClose={() => setThemeSelectorOpen(false)} currentTheme={currentTheme} ownedSkins={ownedSkins} balanceCents={userBalanceCents} onSelect={handleThemeChange} />
      <DiceSkinSelector isOpen={diceSelectorOpen} onClose={() => setDiceSelectorOpen(false)} currentSkin={currentDiceSkin} ownedSkins={ownedDiceSkins} balanceCents={userBalanceCents} onSelect={handleDiceSkinChange} />

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-md animate-in fade-in duration-200 p-6 flex flex-col sm:hidden">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold">Menú</h2>
            <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-white/10 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
          </div>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {room.gameType === "ROULETTE" && (
              <button onClick={() => { setMobileMenuOpen(false); setThemeSelectorOpen(true); }} className="w-full text-left p-4 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-white/10 rounded-xl flex items-center gap-3 active:scale-95 transition-transform">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg" />
                <div><span className="block font-bold text-white">Cambiar Apariencia</span><span className="text-xs opacity-60">Personaliza tu ruleta</span></div>
              </button>
            )}
            {room.gameType === "DICE_DUEL" && (
              <button onClick={() => { setMobileMenuOpen(false); setDiceSelectorOpen(true); }} className="w-full text-left p-4 bg-gradient-to-r from-emerald-900/40 to-green-900/40 border border-white/10 rounded-xl flex items-center gap-3 active:scale-95 transition-transform">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-green-500 shadow-lg" />
                <div><span className="block font-bold text-white">Color de Dados</span><span className="text-xs opacity-60">Personaliza tus dados</span></div>
              </button>
            )}
            <div className="h-px bg-white/10 my-2" />
            <h3 className="text-xs font-bold uppercase opacity-50 px-2 tracking-wider">Navegación</h3>
            <Link href="/rooms" className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg><span>Salas de Juego</span></Link>
            <Link href="/dashboard" className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg><span>Dashboard</span></Link>
            <Link href="/shop" className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg><span>Tienda</span></Link>
            <Link href="/verification" className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg><span>Verificación</span></Link>
            <Link href="/profile" className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg><span>Mi Perfil</span></Link>
          </div>
          <div className="mt-auto pt-4 border-t border-white/10">
            {session?.user && <button onClick={() => signOut({ callbackUrl: "/" })} className="w-full py-4 text-red-400 font-bold bg-red-900/10 rounded-xl hover:bg-red-900/20 flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>Cerrar Sesión</button>}
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-md animate-in slide-in-from-bottom duration-300 p-6 flex flex-col sm:hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Historial</h2>
            <button onClick={() => setHistoryOpen(false)} className="p-2 bg-white/10 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4">
            {room.gameType === "DICE_DUEL" && (
              <div className="mb-4">
                <h3 className="text-xs font-bold uppercase opacity-50 mb-2">Tiradas</h3>
                <DiceHistory room={gameState} />
              </div>
            )}
            <div>
              <h3 className="text-xs font-bold uppercase opacity-50 mb-2">Ganadores Recientes</h3>
              <RoomHistoryList roomId={room.id} reloadKey={reloadHistoryKey} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:hidden">
        {!joining && room.state === "OPEN" &&
          (Math.max(0, room.capacity - (room.entries?.length ?? 0)) > 0) &&
          (room.gameType !== "DICE_DUEL" || !room.entries?.find(e => e.user.email === email)) && (
            <>
              {showMobileBuy ? (
                <div className="fixed inset-x-0 bottom-0 z-[200] p-4 animate-in slide-in-from-bottom duration-300">
                  <div className="bg-[#111] border border-white/10 rounded-3xl p-5 shadow-2xl relative max-h-[60vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                      <div><h3 className="font-bold text-white">Selecciona Puesto</h3><p className="text-xs opacity-50">${(room.priceCents / 100).toFixed(2)} por puesto</p></div>
                      <button onClick={() => setShowMobileBuy(false)} className="p-2 bg-white/5 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
                    </div>
                    <div className="overflow-y-auto mb-4 custom-scrollbar">{renderSeats()}</div>
                    <div className="shrink-0"><BuySeatUI room={room} qty={qty} setQty={setQty} selectedPositions={selectedPositions} setSelectedPositions={setSelectedPositions} joining={joining} onJoin={join} className="border-0 p-0 mt-0" /></div>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowMobileBuy(true)} className="fixed bottom-6 right-6 z-[190] h-14 w-14 bg-emerald-500 text-black rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center animate-in zoom-in duration-300 active:scale-95 font-bold"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg></button>
              )}
            </>
          )}
      </div>

      {/* DESKTOP LAYOUT */}
      <div className="hidden sm:flex items-center justify-between w-full mt-4 mb-6 px-4">
        <div className="flex items-center gap-4">
          <button onClick={handleBackToLobby} className="btn btn-ghost text-sm px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg> Volver
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {room.title}
              <span className="badge badge-outline text-xs font-mono py-2">Ronda {room.currentRound ?? 1}</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-black/40 border border-white/5 px-4 py-2 rounded-xl flex flex-col items-end min-w-[120px]">
            <span className="text-[10px] opacity-50 uppercase font-bold tracking-wider">Tu Saldo</span>
            <span className="text-lg font-bold text-emerald-400 font-mono">${(userBalanceCents / 100).toFixed(2)}</span>
          </div>
          {room.gameType === "ROULETTE" && (
            <button onClick={() => setThemeSelectorOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-white/10 rounded-xl hover:scale-105 transition-transform active:scale-95">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg" />
              <span className="font-bold text-sm">Personalizar</span>
            </button>
          )}
          {room.gameType === "DICE_DUEL" && (
            <button onClick={() => setDiceSelectorOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-900/40 to-green-900/40 border border-white/10 rounded-xl hover:scale-105 transition-transform active:scale-95">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-green-500 shadow-lg" />
              <span className="font-bold text-sm">Cambiar Dados</span>
            </button>
          )}
        </div>
      </div>

      <div className="hidden sm:grid gap-6 grid-cols-12 items-start px-2">
        <div className="col-span-3 h-[600px] sticky top-4">
          {features.includes("chat") ? <ChatWindow roomId={room.id} activePlayerIds={room.entries?.map(e => e.user.id) || []} className="h-full shadow-xl" /> : <div className="h-full bg-white/5 rounded-xl border border-white/10 p-6 flex items-center justify-center">Chat off</div>}
        </div>
        <div className="col-span-5">
          <div className="card bg-base-100 shadow-xl border border-white/5 p-8 flex flex-col items-center justify-center min-h-[500px]">
            <div style={{ maxWidth: 450 }}>
              {room.gameType === "DICE_DUEL" ? (
                // ✅ CORRECCIÓN DESKTOP: Pasamos roomId y user COMPLETO
                <DiceBoard
                  gameState={gameState}
                  userId={safeUser.id}
                  onRoll={handleRoll}
                  onReset={() => join()} // Pasamos JOIN para comprar entrada automáticamente
                />
              ) : (
                <RouletteBoard room={room} email={email} wheelSize={400} theme={currentTheme} onSpinEnd={handleSpinEnd} />
              )}
            </div>
            {showResults && room.state === "FINISHED" && room.gameType === "ROULETTE" && (
              <div className="mt-8 p-4 bg-black/40 rounded-xl text-center">
                <h2 className="text-xl font-bold text-emerald-400">¡GANADOR!</h2>
                <div className="text-2xl font-bold my-2">{room.entries?.find(e => e.id === room.winningEntryId)?.user.name}</div>
                <div className="font-mono opacity-50">{countdownSeconds ? `Next in ${countdownSeconds}s` : "Loading..."}</div>
              </div>
            )}
          </div>
        </div>
        <div className="col-span-4 space-y-4">
          <div className="card">
            <div className="flex justify-between mb-4">
              <h3 className="font-bold">Puestos</h3>
              <span className="text-xs opacity-50">{taken}/{room.capacity}</span>
            </div>
            {renderSeats()}
            <div className="mt-4"><BuySeatUI room={room} qty={qty} setQty={setQty} selectedPositions={selectedPositions} setSelectedPositions={setSelectedPositions} joining={joining} onJoin={join} /></div>
          </div>
          <div className="mt-4 space-y-4">
            {room.gameType === "DICE_DUEL" && (
              <div className="card bg-[#050505] border border-white/10 p-4">
                <div className="mb-2 text-xs font-bold uppercase opacity-50">Historial de Tiradas</div>
                <DiceHistory room={gameState} />
              </div>
            )}
            <RoomHistoryList roomId={room.id} reloadKey={reloadHistoryKey} />
          </div>
        </div>
      </div>

      {features.includes("chat") && (
        <ChatBubble roomId={room.id} activePlayerIds={room.entries?.map(e => e.user.id) || []} />
      )}

      <ConfirmationModal isOpen={confirmModal.isOpen} title={confirmModal.title} onConfirm={confirmModal.onConfirm} onCancel={closeConfirm} variant={confirmModal.variant}>
        {confirmModal.message}
      </ConfirmationModal>
    </main>
  );
}
