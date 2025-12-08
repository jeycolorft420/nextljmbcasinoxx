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
import confetti from "canvas-confetti";
import BuySeatUI from "@/modules/rooms/components/BuySeatUI";
import ConfirmationModal from "@/modules/ui/components/ConfirmationModal";
import { useLicense } from "@/context/LicenseContext";
import ThemeSelector from "@/modules/games/roulette/components/ThemeSelector";

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

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadHistoryKey, setReloadHistoryKey] = useState(0);

  // compra múltiple
  const [qty, setQty] = useState(1);
  const [joining, setJoining] = useState(false);

  // Confirmation Modal State
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

  // Cuenta regresiva visual
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // THEME STATE
  const [currentTheme, setCurrentTheme] = useState("default");
  const [themeSelectorOpen, setThemeSelectorOpen] = useState(false);

  // Extract skins
  const ownedSkins: string[] = useMemo(() => {
    const u = session?.user as any;
    const skins = u?.rouletteSkins || [];
    // Handle if skins are objects or strings
    const cleanNames = skins.map((s: any) => typeof s === 'string' ? s : s.skinId || s.name || s.id);
    return Array.from(new Set(["default", ...cleanNames]));
  }, [session]);

  useEffect(() => {
    if (session?.user && (session.user as any).selectedRouletteSkin) {
      setCurrentTheme((session.user as any).selectedRouletteSkin);
    }
  }, [session]);

  const handleThemeChange = async (skin: string) => {
    // Optimistic
    setCurrentTheme(skin);

    try {
      const res = await fetch("/api/me/skin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skin })
      });
      if (res.ok) {
        toast.success(`Tema actualizado: ${skin.toUpperCase()}`);
        updateSession(); // Try to background update session
      } else {
        toast.error("Error al guardar skin");
      }
    } catch {
      toast.error("Error de red al guardar skin");
    }
  };

  // tamaño ruleta/dados
  const [wheelSize, setWheelSize] = useState(320);
  useEffect(() => {
    const compute = () => {
      // More aggressive resize for mobile centered view
      const w = Math.min(360, Math.max(260, Math.floor(window.innerWidth * 0.85)));
      setWheelSize(w);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // métricas de ocupación
  const taken = room?.entries?.length ?? 0;
  const free = room ? Math.max(0, room.capacity - taken) : 0;
  const pct = room ? Math.max(0, Math.min(100, (taken / room.capacity) * 100)) : 0;

  // Mobile Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showMobileBuy, setShowMobileBuy] = useState(true);

  // Calculate amTop for History Orientation
  const amTop = useMemo(() => {
    if (!room || !email) return false;
    const p1 = room.entries?.find(e => e.position === 1);
    return p1?.user.email === email;
  }, [room, email]);

  // Carga inicial/fallback
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

  // 🛡️ Logic centralizada de actualización
  const handleRoomUpdate = (payload: Room) => {
    setRoom((prev) => {
      // Check for round change or finished state to reload history
      if (prev && (prev.currentRound !== payload.currentRound || (prev.state !== "FINISHED" && payload.state === "FINISHED"))) {
        setReloadHistoryKey(n => n + 1);
      }
      if (JSON.stringify(prev) === JSON.stringify(payload)) return prev;
      return payload;
    });

    const libres = Math.max(0, payload.capacity - (payload.entries?.length ?? 0));
    setQty((q) => Math.min(Math.max(1, q), Math.max(1, libres)));
    const occupied = new Set((payload.entries ?? []).map((e) => e.position));
    setSelectedPositions((prev) => prev.filter((p) => !occupied.has(p)));
  };

  // Carga inicial + Polling de seguridad (5s)
  useEffect(() => {
    load().then(d => { if (d) handleRoomUpdate(d); });
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      fetch(`/api/rooms/${id}`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) handleRoomUpdate(data); })
        .catch(e => console.error("Polling error", e));
    }, 5000);
    return () => clearInterval(interval);
  }, [id]);

  // Watchdog reset
  useEffect(() => {
    if (!room || room.state !== "FINISHED" || !room.finishedAt || room.gameType !== "ROULETTE") {
      setCountdownSeconds(null);
      return;
    }
    const updateCountdown = () => {
      const finishTime = new Date(room.finishedAt!).getTime();
      const diff = Date.now() - finishTime;
      const RESET_DELAY_MS = 20000;
      const textRemaining = Math.max(0, Math.ceil((RESET_DELAY_MS - diff) / 1000));
      setCountdownSeconds(textRemaining);

      if (diff >= RESET_DELAY_MS) {
        fetch(`/api/rooms/${id}/reset`, { method: "POST" }).catch(e => console.error("Reset failed", e));
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [room?.state, room?.finishedAt, room?.gameType, id]);

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
    return () => {
      channel.unbind("room:update", onUpdate);
      pusherClient.unsubscribe(channelName);
    };
  }, [id]);

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

  // --- JOIN ---
  const { optimisticUpdate, rollbackUpdate, balanceCents: walletBalance } = useWallet();

  const join = async () => {
    if (!id) return;
    const costCents = room ? room.priceCents * ((selectedPositions.length > 0 ? selectedPositions.length : qty)) : 0;
    const currentBalance = walletBalance ?? (session?.user as any)?.balanceCents ?? 0;

    if (currentBalance < costCents) {
      toast.error("Saldo insuficiente", {
        description: `Requerido: $${(costCents / 100).toFixed(2)} | Tienes: $${(currentBalance / 100).toFixed(2)}`,
        action: { label: "Recargar", onClick: () => window.location.href = "/wallet/deposit" },
      });
      return;
    }

    setJoining(true);
    optimisticUpdate(-costCents);

    try {
      const payload = selectedPositions.length > 0 ? { positions: selectedPositions } : { quantity: qty };
      const res = await fetch(`/api/rooms/${id}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        rollbackUpdate(costCents);
        toast.error(data.error || "No se pudo unir");
      } else {
        const takenList = Array.isArray(data.positions) ? data.positions : [];
        if (takenList.length) toast.success(`Puestos: [${takenList.join(", ")}]`);
        else toast.success("¡Unido!");
        setSelectedPositions([]);

        if (room && session?.user && takenList.length > 0) {
          // Optimistic Entry Add
          const newEntries = takenList.map((pos: number) => ({
            id: `temp-${pos}-${Date.now()}`,
            position: pos,
            user: { id: (session.user as any)?.id || "me", name: session.user?.name || "Yo", email: session.user?.email! }
          }));
          setRoom((prev) => {
            if (!prev) return prev;
            const others = (prev.entries || []).filter(e => !takenList.includes(e.position));
            return { ...prev, entries: [...others, ...newEntries] };
          });
          setTimeout(() => { load().then(d => { if (d) handleRoomUpdate(d); }); }, 500);
        }
      }
    } catch {
      rollbackUpdate(costCents);
      toast.error("Error de red");
    } finally {
      setJoining(false);
    }
  };

  const handleReroll = async () => {
    if (!id || room?.gameMeta?.ended) return;
    await fetch(`/api/rooms/${id}/reroll`, { method: "POST" });
  };

  const handleForfeit = async (skipConfirm = false) => {
    if (!id || room?.gameMeta?.ended) return;
    const fn = async () => { await fetch(`/api/rooms/${id}/forfeit`, { method: "POST", headers: { "Content-Type": "application/json" } }); };
    if (skipConfirm) fn();
    else setConfirmModal({ isOpen: true, title: "Rendirse", message: "¿Rendirse y perder apuesta?", onConfirm: () => { fn(); closeConfirm(); }, variant: "danger" });
  };

  const handleLeave = async () => {
    if (!id) return;
    const isParticipant = room?.entries?.some(e => e.user.email === email);
    if (!isParticipant) { window.location.href = "/rooms"; return; }
    setConfirmModal({
      isOpen: true, title: "Abandonar Sala", message: "¿Abandonar la sala? Perderás tu apuesta.",
      onConfirm: async () => {
        const r = await fetch(`/api/rooms/${id}/leave`, { method: "POST" });
        if (r.ok) window.location.href = "/rooms";
        else toast.error("No se pudo abandonar");
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
    await fetch(`/api/rooms/${id}/leave`, { method: "POST" }).catch(() => { });
    await fetch(`/api/rooms/${id}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: 1 }),
    }).catch(() => { });
  };

  if (loading && !room) return <div className="text-center mt-10 opacity-50">Cargando...</div>;
  if (!room) return <div className="text-center mt-10">Sala no encontrada <br /><Link href="/rooms" className="underline">Volver</Link></div>;

  const renderSeats = () => (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: room.capacity }).map((_, i) => {
        const pos = i + 1;
        const entry = room.entries?.find((e) => e.position === pos);
        const occupied = !!entry;
        const isMine = entry?.user.email === email;
        const isSelected = selectedPositions.includes(pos);
        const isWinner = !!room.winningEntryId && entry?.id === room.winningEntryId;
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
    <main className="fixed inset-0 z-[100] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-[#050505] to-black text-white overflow-hidden flex flex-col sm:static sm:z-auto sm:bg-transparent sm:block sm:max-w-[1400px] sm:mx-auto sm:space-y-4 sm:px-2 sm:pb-4">

      {/* MOBILE TOP BAR */}
      <div className="sm:hidden h-16 px-4 flex items-center justify-between z-[110] bg-gradient-to-b from-black/80 to-transparent shrink-0">
        <button onClick={handleBackToLobby} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>

        <div className="flex gap-2">
          {/* Theme Toggle */}
          {room.gameType === "ROULETTE" && (
            <button onClick={() => setThemeSelectorOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md text-white/80">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
            </button>
          )}
          {/* Menu */}
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/5 backdrop-blur-md text-white/80">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* MOBILE CENTER STAGE */}
      <div className="flex-1 flex flex-col sm:hidden relative overflow-hidden">
        {/* Info Bar */}
        <div className="flex justify-between px-6 py-2 text-xs font-mono opacity-60">
          <span>ROUND #{room.currentRound ?? 1}</span>
          <span className={stateBadgeClass(room.state)}>{room.state}</span>
        </div>

        {/* Board Container - Centered */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="relative z-10 transition-all duration-500" style={{ width: wheelSize, height: wheelSize }}>
            {room.gameType === "DICE_DUEL" ? (
              <DiceBoard room={room} email={email} onReroll={handleReroll} onForfeit={handleForfeit} onLeave={handleLeave} onRejoin={handleRejoin} onOpenHistory={() => setHistoryOpen(true)} onAfterAnim={() => { }} wheelSize={wheelSize} />
            ) : (
              <RouletteBoard room={room} email={email} wheelSize={wheelSize} theme={currentTheme} />
            )}
          </div>

          {/* Floating History Trigger */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="absolute left-6 bottom-4 p-3 z-20 bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 rounded-full backdrop-blur-md shadow-lg active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </button>
        </div>

        {/* Winner Toast (if finished) */}
        {room.state === "FINISHED" && room.gameType === "ROULETTE" && (
          <div className="absolute bottom-24 left-4 right-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-center animate-in slide-in-from-bottom duration-300 z-30">
            <h3 className="text-primary font-bold">¡Ronda Finalizada!</h3>
            <p className="text-white text-lg font-bold mt-1">
              🏆 {room.entries?.find(e => e.id === room.winningEntryId)?.user.name || "Ganador"}
            </p>
            <p className="text-xs opacity-50 font-mono mt-2">{countdownSeconds ? `Reiniciando en ${countdownSeconds}s` : "Reiniciando..."}</p>
          </div>
        )}

        {/* Bottom Spacer for Popup Handle */}
        <div className="h-16 shrink-0" />
      </div>

      {/* ----------------- MODALS & OVERLAYS ----------------- */}

      <ThemeSelector
        isOpen={themeSelectorOpen}
        onClose={() => setThemeSelectorOpen(false)}
        currentTheme={currentTheme}
        ownedSkins={ownedSkins}
        onSelect={handleThemeChange}
      />

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md animate-in fade-in duration-200 p-6 flex flex-col sm:hidden">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold">Menú</h2>
            <button onClick={() => setMobileMenuOpen(false)} className="p-2 bg-white/10 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
          </div>
          <div className="space-y-4">
            <button onClick={() => { setMobileMenuOpen(false); setThemeSelectorOpen(true); }} className="w-full text-left p-4 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500" />
              <span className="font-bold">Cambiar Apariencia</span>
            </button>
            <button onClick={handleBackToLobby} className="w-full text-left p-4 bg-white/5 rounded-xl border border-white/5">Volver al Lobby</button>
            <Link href="/profile" className="block w-full text-left p-4 bg-white/5 rounded-xl border border-white/5">Mi Perfil</Link>
          </div>
          <div className="mt-auto">
            {session?.user && <button onClick={() => signOut()} className="w-full py-4 text-red-400 font-bold bg-red-900/10 rounded-xl">Cerrar Sesión</button>}
          </div>
        </div>
      )}

      {/* Mobile History */}
      {historyOpen && (
        <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-md animate-in slide-in-from-bottom duration-300 p-6 flex flex-col sm:hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Historial</h2>
            <button onClick={() => setHistoryOpen(false)} className="p-2 bg-white/10 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <RoomHistoryList roomId={room.id} reloadKey={reloadHistoryKey} />
          </div>
        </div>
      )}

      {/* Mobile Seat Popup */}
      <div className="lg:hidden">
        {room.state === "OPEN" &&
          (Math.max(0, room.capacity - (room.entries?.length ?? 0)) > 0) &&
          (room.gameType !== "DICE_DUEL" || !room.entries?.find(e => e.user.email === email)) && (
            <>
              {showMobileBuy ? (
                <div className="fixed inset-x-0 bottom-0 z-[200] p-4 animate-in slide-in-from-bottom duration-300">
                  <div className="bg-[#111] border border-white/10 rounded-3xl p-5 shadow-2xl relative max-h-[60vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                      <div>
                        <h3 className="font-bold text-white">Selecciona Puesto</h3>
                        <p className="text-xs opacity-50">${(room.priceCents / 100).toFixed(2)} por puesto</p>
                      </div>
                      <button onClick={() => setShowMobileBuy(false)} className="p-2 bg-white/5 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
                    </div>
                    <div className="overflow-y-auto mb-4 custom-scrollbar">
                      {renderSeats()}
                    </div>
                    <div className="shrink-0">
                      <BuySeatUI room={room} qty={qty} setQty={setQty} selectedPositions={selectedPositions} setSelectedPositions={setSelectedPositions} joining={joining} onJoin={join} className="border-0 p-0 mt-0" />
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowMobileBuy(true)} className="fixed bottom-6 right-6 z-[190] h-14 w-14 bg-emerald-500 text-black rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center animate-in zoom-in duration-300 active:scale-95 font-bold">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                </button>
              )}
            </>
          )}
      </div>


      {/* ----------------- DESKTOP LAYOUT (PRESERVED) ----------------- */}
      <div className="hidden sm:flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div className="space-y-2">
          <button onClick={handleBackToLobby} className="btn btn-ghost text-xs px-2 py-1 w-fit">← Volver</button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{room.title}</h1>
            <div className="badge badge-outline text-xs">Ronda {room.currentRound ?? 1}</div>
          </div>
        </div>
      </div>

      <div className="hidden sm:grid gap-4 grid-cols-12 items-start mt-4">
        <div className="col-span-3 h-[600px] sticky top-4">
          {features.includes("chat") ? <ChatWindow roomId={room.id} activePlayerIds={room.entries?.map(e => e.user.id) || []} className="h-full shadow-xl" /> : <div className="h-full bg-white/5 rounded-xl border border-white/10 p-6 flex items-center justify-center">Chat off</div>}
        </div>
        <div className="col-span-5">
          <div className="card bg-base-100 shadow-xl border border-white/5 p-8 flex flex-col items-center justify-center min-h-[500px]">
            <div style={{ maxWidth: 450 }}>
              {room.gameType === "DICE_DUEL" ? (
                <DiceBoard room={room} email={email} onReroll={handleReroll} onForfeit={handleForfeit} onLeave={handleLeave} onRejoin={handleRejoin} onOpenHistory={() => setHistoryOpen(true)} onAfterAnim={() => { }} wheelSize={400} />
              ) : (
                <RouletteBoard room={room} email={email} wheelSize={400} theme={currentTheme} />
              )}
            </div>
            {/* Desktop Winner Toast */}
            {room.state === "FINISHED" && room.gameType === "ROULETTE" && (
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
          <div className="mt-4"><RoomHistoryList roomId={room.id} reloadKey={reloadHistoryKey} /></div>
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
