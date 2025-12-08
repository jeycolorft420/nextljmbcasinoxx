"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import RouletteBoard from "@/components/RouletteBoard";
import DiceBoard, { DiceHistory } from "@/components/dice/DiceBoard";
import RoomHistoryList from "@/components/RoomHistoryList"; // 👈 Nuevo componente
import { pusherClient } from "@/lib/pusher-client";
import ChatBubble from "@/components/chat/ChatBubble";
import ChatWindow from "@/components/chat/ChatWindow";
import { useWallet } from "@/hooks/use-wallet";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import BuySeatUI from "@/components/BuySeatUI";
import ConfirmationModal from "@/components/ConfirmationModal";
import { useLicense } from "@/context/LicenseContext";

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
  currentRound?: number; // 👈
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
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadHistoryKey, setReloadHistoryKey] = useState(0); // Para forzar recarga del historial

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



  // evita múltiples POST /finish concurrentes
  const finishInFlightRef = useRef(false);

  // tamaño ruleta/dados
  const [wheelSize, setWheelSize] = useState(320);
  useEffect(() => {
    const compute = () => {
      const w = Math.min(360, Math.max(260, Math.floor(window.innerWidth * 0.78)));
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
      // Forzar recarga de history al entrar
      setReloadHistoryKey(n => n + 1);

      const libres = Math.max(0, data.capacity - (data.entries?.length ?? 0));
      setQty((q) => Math.min(Math.max(1, q), Math.max(1, libres)));

      const occupied = new Set((data.entries ?? []).map((e) => e.position));
      setSelectedPositions((prev) => prev.filter((p) => !occupied.has(p)));

      // Reset de animación si no está FINISHED
      // (Lógica movida a RouletteBoard)
      return data;
    } catch (err) {
      console.error("load error", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 🛡️ Logic centralizada de actualización (Pusher + Polling + Manual)
  const handleRoomUpdate = (payload: Room) => {
    // 1. Validar finalización automática (Auto-Start)
    // MOVIDO AL SERVER (join/route.ts) para evitar Thundering Herd.
    // El cliente ya no dispara /finish.

    // 2. Actualizar Estado React
    setRoom((prev) => {
      if (prev && payload.currentRound !== undefined && prev.currentRound !== payload.currentRound) {
        setReloadHistoryKey(n => n + 1);
      }
      if (JSON.stringify(prev) === JSON.stringify(payload)) return prev;
      return payload;
    });

    // 3. Sincronizar inputs
    const libres = Math.max(0, payload.capacity - (payload.entries?.length ?? 0));
    setQty((q) => Math.min(Math.max(1, q), Math.max(1, libres)));
    const occupied = new Set((payload.entries ?? []).map((e) => e.position));
    setSelectedPositions((prev) => prev.filter((p) => !occupied.has(p)));

    // 4. ANIMACIÓN DE GIRO (Critical Path) - MOVIDO A RouletteBoard
    // La lógica de animación ahora reside en el componente RouletteBoard.
    // RoomPage solo pasa el estado actualizado.
  };

  // Carga inicial + Polling de seguridad (5s)
  useEffect(() => {
    load().then(d => {
      if (d) {
        console.log("🚀 Initial Load Complete, checking animation...");
        handleRoomUpdate(d);
      }
    });

    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return; // Ahorrar recursos si tab inactivo
      fetch(`/api/rooms/${id}`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data) handleRoomUpdate(data);
        })
        .catch(e => console.error("Polling error", e));
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Watchdog: Si al cargar (o reconectar) la sala está FINISHED hace > 8s, disparar reset.
  // Muestra cuenta regresiva.
  useEffect(() => {
    if (!room || room.state !== "FINISHED" || !room.finishedAt || room.gameType !== "ROULETTE") {
      setCountdownSeconds(null);
      return;
    }

    const updateCountdown = () => {
      const finishTime = new Date(room.finishedAt!).getTime();
      const now = Date.now();
      const diff = now - finishTime;
      const RESET_DELAY_MS = 20000; // 20s para coincidir con validación server

      const textRemaining = Math.max(0, Math.ceil((RESET_DELAY_MS - diff) / 1000));
      setCountdownSeconds(textRemaining);

      if (diff >= RESET_DELAY_MS) {
        // Tiempo cumplido, intentar reset
        fetch(`/api/rooms/${id}/reset`, { method: "POST" })
          .catch(e => console.error("Watchdog reset failed", e));
        // No limpiamos el intervalo aquí, dejamos que el cambio de estado lo mate
      }
    };

    updateCountdown(); // inmediato
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [room?.state, room?.finishedAt, room?.gameType, id]);

  // 👉 Realtime (Pusher) - Restored
  useEffect(() => {
    if (!id) return;
    const channelName = `private-room-${id}`;
    const channel = pusherClient.subscribe(channelName);

    const onUpdate = (evt: any) => {
      console.log("⚡ Pusher Event:", evt);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);





  // seleccionar/deseleccionar puesto (si está libre y sala OPEN)
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
    if (selectedPositions.length > 0 && qty < selectedPositions.length) {
      setQty(selectedPositions.length);
    }
  }, [selectedPositions.length, qty]);

  // --- JOIN ---
  const { optimisticUpdate, rollbackUpdate, balanceCents: walletBalance } = useWallet();

  const join = async () => {
    if (!id) return;

    // 1. Validar saldo ANTES de optimistas (Usando Wallet Context actualizado)
    const costCents = room ? room.priceCents * ((selectedPositions.length > 0 ? selectedPositions.length : qty)) : 0;
    const currentBalance = walletBalance ?? (session?.user as any)?.balanceCents ?? 0;

    if (currentBalance < costCents) {
      toast.error("Saldo insuficiente", {
        description: `Necesitas $${(costCents / 100).toFixed(2)} pero tienes $${(currentBalance / 100).toFixed(2)}`,
        action: {
          label: "Recargar",
          onClick: () => window.location.href = "/wallet/deposit"
        },
        duration: 5000,
      });
      return;
    }

    setJoining(true);

    // 2. Optimistic Update (subtract cost immediately)
    optimisticUpdate(-costCents);

    try {
      const payload = selectedPositions.length > 0 ? { positions: selectedPositions } : { quantity: qty };
      const res = await fetch(`/api/rooms/${id}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        // 3. Rollback if failed
        rollbackUpdate(costCents);
        toast.error(data.error || "No se pudo unir");
      } else {
        const takenList = Array.isArray(data.positions) ? data.positions : [];
        if (takenList.length) toast.success(`Puestos asignados: [${takenList.join(", ")}]`);
        else toast.success("¡Unido a la sala!");
        setSelectedPositions([]);

        // ⚡ UPDATE LOCAL STATE IMMEDIATELY (Fix for laggy/stale updates)
        if (room && session?.user && takenList.length > 0) {
          const newEntries = takenList.map((pos: number) => ({
            id: `temp-${pos}-${Date.now()}`,
            position: pos,
            user: {
              id: (session.user as any)?.id || "me",
              name: session.user?.name || "Yo",
              email: session.user?.email!,
            }
          }));

          setRoom((prev) => {
            if (!prev) return prev;
            // Filter out any existing entries at these positions to avoid dupes
            const others = (prev.entries || []).filter(e => !takenList.includes(e.position));
            return { ...prev, entries: [...others, ...newEntries] };
          });

          // ⚡ Force sync to speed up Auto-Start
          setTimeout(() => {
            load().then(d => { if (d) handleRoomUpdate(d); });
          }, 500);
        }
      }
    } catch {
      // 3. Rollback on network error
      rollbackUpdate(costCents);
      toast.error("Error de red al unirse");
    } finally {
      setJoining(false);
    }
  };

  // --- DADOS: handlers ---
  const handleReroll = async () => {
    if (!id || room?.gameMeta?.ended) return;
    const r = await fetch(`/api/rooms/${id}/reroll`, { method: "POST" });
    let d: any = {};
    try { d = await r.json(); } catch { }
    if (!r.ok) {
      alert(d.error || "No se pudo jugar la ronda");
      return;
    }
  };

  const handleForfeit = async (skipConfirm = false) => {
    if (!id || room?.gameMeta?.ended) return;

    const executeForfeit = async () => {
      const r = await fetch(`/api/rooms/${id}/forfeit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      let d: any = {};
      try { d = await r.json(); } catch { }
      if (!r.ok) {
        console.error(d.error || "No se pudo aplicar forfeit");
        return;
      }
    };

    if (skipConfirm) {
      executeForfeit();
    } else {
      setConfirmModal({
        isOpen: true,
        title: "Rendirse",
        message: "¿Estás seguro de que quieres rendirte? Perderás todo lo apostado en esta ronda.",
        onConfirm: () => {
          executeForfeit();
          closeConfirm();
        },
        variant: "danger",
      });
    }
  };

  const handleLeave = async () => {
    if (!id) return;

    // Check if user is a participant
    const isParticipant = room?.entries?.some(e => e.user.email === email);

    if (!isParticipant) {
      // Spectator: Just redirect
      window.location.href = "/rooms";
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Abandonar Sala",
      message: "¿Seguro que quieres abandonar la sala? Si estás jugando, perderás tu apuesta y tu puesto.",
      onConfirm: async () => {
        const r = await fetch(`/api/rooms/${id}/leave`, { method: "POST" });
        let d: any = {};
        try { d = await r.json(); } catch { }
        if (!r.ok) {
          toast.error(d.error || "No se pudo abandonar");
        } else {
          // Redirect to lobby on success
          window.location.href = "/rooms";
        }
        closeConfirm();
      },
      variant: "danger",
    });
  };

  const handleBackToLobby = () => {
    // Check if user is a participant
    const isParticipant = room?.entries?.some(e => e.user.email === email);
    if (isParticipant) {
      handleLeave();
    } else {
      window.location.href = "/rooms";
    }
  };

  // Volver a entrar tras finalizar el duelo
  const handleRejoin = async () => {
    if (!id) return;
    await fetch(`/api/rooms/${id}/leave`, { method: "POST" }).catch(() => { });
    await fetch(`/api/rooms/${id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 1 }),
    }).catch(() => { });
  };

  if (loading && !room) {
    return (
      <main className="max-w-5xl mx-auto space-y-4 px-2 text-center">
        <div className="text-sm opacity-80">Cargando…</div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="max-w-5xl mx-auto space-y-4 px-2 text-center">
        <div className="text-sm opacity-80">Sala no encontrada.</div>
        <Link href="/rooms" className="btn btn-ghost w-full sm:w-auto text-center">
          ← Volver
        </Link>
      </main>
    );
  }

  const totalUnits = selectedPositions.length > 0 ? selectedPositions.length : qty;
  const totalUSD = ((room.priceCents * totalUnits) / 100).toFixed(2);

  return (
    <main className="fixed inset-0 z-[100] bg-background overflow-hidden flex flex-col justify-center sm:static sm:z-auto sm:bg-transparent sm:block sm:max-w-[1400px] sm:mx-auto sm:space-y-4 sm:px-2 sm:pb-4">

      {/* Mobile Hamburger */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="sm:hidden absolute top-4 right-4 z-[110] p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-all active:scale-95 border border-white/10 shadow-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
      </button>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[120] bg-background/95 backdrop-blur-xl animate-in fade-in duration-200 flex flex-col p-6 overflow-y-auto sm:hidden">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-lg shadow-lg">
                {room.title.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-none">{room.title}</h2>
                <span className="text-xs opacity-50">Menú de Sala</span>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>

          <div className="space-y-6 flex-1">
            {/* Room Info Card */}
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className={stateBadgeClass(room.state)}>{room.state}</span>
                <span className="badge bg-white/10 border-white/10 text-white">${(room.priceCents ?? 0) / 100}</span>
                <span className="badge bg-white/10 border-white/10 text-white">{room.capacity} puestos</span>
                <span className="badge bg-white/10 border-white/10 text-white">{room.gameType === "DICE_DUEL" ? "Dados 1v1" : "Ruleta"}</span>
              </div>
              <button onClick={handleBackToLobby} className="btn btn-outline btn-sm w-full gap-2 text-white/80 hover:text-white hover:bg-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                Volver al Lobby
              </button>
            </div>

            <div className="h-px bg-white/10 my-2" />

            {/* Global Navigation */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase opacity-50 px-2 mb-2">Navegación</h3>
              <button onClick={handleBackToLobby} className="block w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium">
                Salas
              </button>
              <Link href="/dashboard" className="block px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium">
                Dashboard
              </Link>
              <Link href="/profile" className="block px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium">
                Perfil
              </Link>
              <Link href="/shop" className="block px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium">
                Tienda
              </Link>
              {((session?.user as any)?.role === "admin" || (session?.user as any)?.role === "god") && (
                <Link href="/admin" className="block px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-medium text-yellow-400/90">
                  Admin Panel
                </Link>
              )}
            </div>
          </div>

          {/* User Footer */}
          <div className="mt-auto pt-6 border-t border-white/10 space-y-4">
            {session?.user ? (
              <>
                <div className="flex items-center justify-between px-2">
                  <div className="flex flex-col">
                    <span className="font-bold text-white">{session.user.name || "Usuario"}</span>
                    <span className="text-xs opacity-50">{session.user.email}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] opacity-50 uppercase tracking-wider">Saldo</div>
                    <div className="font-bold text-emerald-400 text-lg">
                      ${((walletBalance ?? (session.user as any).balanceCents ?? 0) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full py-3 rounded-xl bg-red-500/10 text-red-400 font-bold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn(undefined, { callbackUrl: `/rooms/${id}` })}
                className="w-full py-3 rounded-xl bg-primary text-primary-content font-bold hover:brightness-110 transition-colors"
              >
                Iniciar Sesión
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile History Overlay */}
      {historyOpen && (
        <div className="fixed inset-0 z-[120] bg-background/95 backdrop-blur-xl animate-in fade-in duration-200 flex flex-col p-6 overflow-y-auto sm:hidden">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
              <h2 className="text-xl font-bold text-white">Historiales</h2>
            </div>
            <button
              onClick={() => setHistoryOpen(false)}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>

          <div className="space-y-8 flex-1">
            {/* Dice History */}
            {room.gameType === "DICE_DUEL" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold uppercase opacity-60 tracking-wider">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M12 8v8" /><path d="m8 12 8 0" /></svg>
                  Historial de Dados
                </div>
                <DiceHistory room={room} swapVisuals={amTop} className="bg-white/5 border-white/10 shadow-inner" />
              </div>
            )}

            {/* Room History */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold uppercase opacity-60 tracking-wider">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                Historial de Ganadores
              </div>
              <div className="bg-white/5 rounded-xl border border-white/10 p-2 max-h-[200px] overflow-y-auto">
                <RoomHistoryList roomId={room.id} reloadKey={reloadHistoryKey} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="hidden sm:flex flex-col items-center text-center gap-2 sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div className="space-y-2">
          <button onClick={handleBackToLobby} className="btn btn-ghost text-xs px-2 py-1 w-fit">← Volver</button>
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">{room.title}</h1>
            <div className="badge badge-outline text-[10px] opacity-70">Ronda {room.currentRound ?? 1}</div>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
            <span className={stateBadgeClass(room.state)}>{room.state}</span>
            <span className="badge">${(room.priceCents ?? 0) / 100}</span>
            <span className="badge">{room.capacity} puestos</span>
            <span className="badge">{room.gameType === "DICE_DUEL" ? "Dados 1v1" : "Ruleta"}</span>
          </div>
        </div>
      </div>

      {/* Grid: 3 Columnas en Escritorio */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12 items-start">

        {/* COL IZQUIERDA: CHAT (Solo Desktop) */}
        <div className="hidden lg:block lg:col-span-3 h-[600px] sticky top-4">
          {features.includes("chat") ? (
            <ChatWindow
              roomId={room.id}
              activePlayerIds={room.entries?.map(e => e.user.id) || []}
              className="h-full shadow-xl"
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-white/5 rounded-xl border border-white/10 p-6 text-center">
              <div className="opacity-50 text-sm">Chat deshabilitado por licencia</div>
            </div>
          )}
        </div>

        {/* COL CENTRAL: JUEGO */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card bg-base-100 shadow-xl border border-white/5 p-0 sm:p-4 flex flex-col items-center justify-center min-h-[400px] relative">
            <div className="w-full mx-auto" style={{ maxWidth: wheelSize }}>
              {room.gameType === "DICE_DUEL" ? (
                <DiceBoard
                  room={room}
                  email={email}
                  onReroll={handleReroll}
                  onForfeit={handleForfeit}
                  onLeave={handleLeave}
                  onRejoin={handleRejoin}
                  onOpenHistory={() => setHistoryOpen(true)}
                  onAfterAnim={() => { }}
                  wheelSize={wheelSize}
                />
              ) : (
                <RouletteBoard
                  room={room}
                  email={email}
                  wheelSize={wheelSize}
                />
              )}
            </div>

            {/* RESUMEN FINALIZADA (ruleta) */}
            {
              room.state === "FINISHED" && room.gameType === "ROULETTE" && (
                <div className="mt-4 p-4 bg-black/20 rounded-lg w-full text-center animate-in fade-in zoom-in duration-300">
                  <h2 className="font-semibold text-lg text-primary">¡Ronda Finalizada!</h2>
                  <p className="mt-1">Premio: <strong>${room.prizeCents ? room.prizeCents / 100 : 0}</strong></p>

                  {room.winningEntryId ? (
                    <p className="mt-2 text-xl font-bold text-white">
                      🏆 {room.entries?.find((e) => e.id === room.winningEntryId)?.user?.name ||
                        room.entries?.find((e) => e.id === room.winningEntryId)?.user?.email ||
                        "Desconocido"}
                    </p>
                  ) : (
                    <p className="mt-2 opacity-70 animate-pulse">Revelando ganador…</p>
                  )}

                  <div className="mt-3 text-xs opacity-50 font-mono">
                    {countdownSeconds !== null && countdownSeconds > 0
                      ? `Reiniciando en ${countdownSeconds}s...`
                      : "Reiniciando sala..."}
                  </div>
                </div>
              )
            }
          </div >

          {/* CTA Mobile se queda aqui o se duplica? Mejor en Col Derecha para desktop */}
        </div >

        {/* COL DERECHA: Puestos + Historial */}
        <div className="col-span-1 lg:col-span-4 space-y-4">
          {/* Puestos */}
          < div className="card" >
            <div className="flex items-end justify-between gap-2 mb-2">
              <h2 className="font-semibold text-sm">Puestos (Ronda {room.currentRound ?? 1})</h2>
              <div className="w-40 sm:w-44">
                <div className="text-[11px] text-right opacity-70">{taken}/{room.capacity} ocupados</div>
                <div className="progress-track mt-1">
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            <div className="grid [grid-template-columns:repeat(auto-fit,minmax(80px,1fr))] gap-2">
              {Array.from({ length: room.capacity }).map((_, i) => {
                const pos = i + 1;
                const entry = room.entries?.find((e) => e.position === pos);
                const occupied = !!entry;
                const isSelected = selectedPositions.includes(pos);
                const isWinner = !!room.winningEntryId && entry?.id === room.winningEntryId;
                const canToggle = room.state === "OPEN" && !occupied;

                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => canToggle && togglePosition(pos)}
                    className={`rounded-md border p-1.5 text-center text-[10px] transition relative overflow-hidden
                        ${isWinner ? "border-green-500/80 bg-green-500/10"
                        : isSelected ? "border-blue-400 ring-1 ring-blue-400/40 bg-blue-500/10"
                          : occupied ? "border-white/10 bg-white/5" : "border-white/5 opacity-60 hover:opacity-100"}
                        ${canToggle ? "hover:bg-white/10 cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="font-bold opacity-50 mb-0.5">#{pos}</div>
                    {entry ? (
                      <div className="font-medium truncate leading-tight">
                        {entry.user.name || entry.user.email.split("@")[0]}
                      </div>
                    ) : (
                      <div className="opacity-40">{isSelected ? "Tuyo" : "Libre"}</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* CTA compra (solo cuando OPEN) */}
            {/* CTA compra (solo cuando OPEN) */}
            <BuySeatUI
              room={room}
              qty={qty}
              setQty={setQty}
              selectedPositions={selectedPositions}
              setSelectedPositions={setSelectedPositions}
              joining={joining}
              onJoin={join}
            />
          </div>

          {/* Historial (Debajo de Puestos) */}
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase opacity-50 mb-2 px-1">Historial Reciente</h3>
            <RoomHistoryList roomId={room.id} reloadKey={reloadHistoryKey} />
          </div>

          {/* Historial Dados (si aplica) */}
          {
            room.gameType === "DICE_DUEL" && (
              <div className="mt-4 hidden md:block">
                <DiceHistory room={room} className="w-full" maxHeight={260} />
              </div>
            )
          }
        </div>
      </div>

      {/* Mobile Buy Popup (Only if OPEN & (Roulette OR (Dice & Not Participating))) */}
      <div className="lg:hidden">
        {room.state === "OPEN" &&
          (Math.max(0, room.capacity - (room.entries?.length ?? 0)) > 0) &&
          (room.gameType !== "DICE_DUEL" || !room.entries?.find(e => e.user.email === email)) && (
            <>
              {/* POPUP */}
              {showMobileBuy && (
                <div className="fixed inset-x-0 bottom-0 z-[200] p-4 animate-in slide-in-from-bottom duration-300">
                  <div className="bg-card border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50 relative">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-lg text-white">Unirse a la Sala</h3>
                      <button
                        onClick={() => setShowMobileBuy(false)}
                        className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                      </button>
                    </div>

                    <BuySeatUI
                      room={room}
                      qty={qty}
                      setQty={setQty}
                      selectedPositions={selectedPositions}
                      setSelectedPositions={setSelectedPositions}
                      joining={joining}
                      onJoin={join}
                      className="mt-0 pt-0 border-0"
                    />
                  </div>
                </div>
              )}

              {/* FLOATING TRIGGER (When closed) */}
              {!showMobileBuy && (
                <button
                  onClick={() => setShowMobileBuy(true)}
                  className="fixed bottom-20 right-4 z-[190] h-12 w-12 bg-primary text-primary-content rounded-full shadow-lg shadow-primary/30 flex items-center justify-center animate-in zoom-in duration-300 active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></svg>
                </button>
              )}
            </>
          )}
      </div>

      {/* Boton Chat Flotante (Mobile Only) */}
      {features.includes("chat") && (
        <ChatBubble roomId={room.id} activePlayerIds={room.entries?.map(e => e.user.id) || []} />
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
        variant={confirmModal.variant}
      >
        {confirmModal.message}
      </ConfirmationModal>
    </main>
  );
}
