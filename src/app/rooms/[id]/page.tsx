"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import RouletteWheel from "@/components/RouletteWheel";

type Entry = {
  id: string;
  position: number;
  user: { id: string; name: string | null; email: string };
};

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
};

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as "admin" | "user" | undefined;

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // ---- Polling control ----
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // ---- Ruleta: estado de giro ----
  const [spinKey, setSpinKey] = useState(0);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);

  // ---- Derivados útiles ----
  const taken = room?.entries?.length ?? 0;
  const free = room ? room.capacity - taken : 0;
  const alreadyIn = !!room?.entries?.some(
    (e) => e.user.email === session?.user?.email
  );

  // =========================
  // 1) Cargar detalle (con AbortController)
  // =========================
  const load = async () => {
    if (!id) return;
    try {
      inFlight.current?.abort();
      const ac = new AbortController();
      inFlight.current = ac;

      setLoading((prev) => (room ? prev : true));
      const res = await fetch(`/api/rooms/${id}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as Room;
        setRoom(data);
      }
    } catch {
      // ignoramos errores por abort u otros transitorios
    } finally {
      setLoading(false);
      inFlight.current = null;
    }
  };

  // =========================
  // 2) Primer load + polling cada 3s
  // =========================
  useEffect(() => {
    load();

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        if (room?.state !== "FINISHED") load();
      }
    }, 3000);

    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVis);
      inFlight.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // solo depende del id

  // =========================
  // 3) Unirse a la sala
  // =========================
  const join = async () => {
    if (!id) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${id}/join`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo unir");
      } else {
        await load();
      }
    } catch {
      alert("Error de red al unirse");
    } finally {
      setJoining(false);
    }
  };

  // =========================
  // 4) Segmentar la rueda (12 puestos)
  // =========================
  const segments = useMemo(() => {
    if (!room) return [];
    return Array.from({ length: room.capacity }).map((_, i) => {
      const entry = room.entries?.find((e) => e.position === i + 1);
      const label = entry
        ? (entry.user.name || entry.user.email.split("@")[0])
        : `Libre #${i + 1}`;

      return {
        label,
        muted: !entry,
        isYou: entry?.user.email === session?.user?.email,
        isWinner:
          !!room.winningEntryId && entry?.id === room.winningEntryId,
      };
    });
  }, [room, session?.user?.email]);

  // Índice del ganador en el arreglo de entries (si ya está FINISHED)
  const finishedWinnerIndex =
    room?.winningEntryId && room.entries
      ? room.entries.findIndex((e) => e.id === room.winningEntryId)
      : -1;

  // =========================
  // 5) Sortear desde la sala (opcional admin)
  //    - Llama al endpoint /finish
  //    - Usa la respuesta para girar hacia el ganador
  // =========================
  const [finishing, setFinishing] = useState(false);
  const sortear = async () => {
    if (!id || finishing) return;
    setFinishing(true);
    try {
      const res = await fetch(`/api/rooms/${id}/finish`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "No se pudo sortear");
        setFinishing(false);
        return;
      }

      // Calcular índice del ganador (por posición, 1..capacidad)
      // data.winningEntryId viene del backend
      const idx =
        room?.entries?.findIndex((e) => e.id === data.winningEntryId) ?? -1;
      if (idx >= 0) {
        setTargetIndex(idx);
        setSpinKey((k) => k + 1); // dispara la animación
      }

      // tras el giro, recargamos (en onSpinEnd) para ver FINISHED/prize
    } catch {
      alert("Error de red al sortear");
      setFinishing(false);
    }
  };

  // Cuando termina el giro, recarga para mostrar datos finales
  const onSpinEnd = async () => {
    await load();
    setFinishing(false);
  };

  // =========================
  // 6) UI
  // =========================
  if (loading && !room) {
    return <main className="p-6">Cargando...</main>;
  }
  if (!room) {
    return <main className="p-6">Sala no encontrada.</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <a href="/rooms" className="underline text-sm">← Volver</a>

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{room.title}</h1>
        <span className="text-sm opacity-80">
          {taken}/{room.capacity} ocupados
        </span>
      </div>

      <p className="opacity-80">
        Estado: {room.state} · Precio: ${room.priceCents / 100}
      </p>

      {/* ===== RUEDA ===== */}
      <div className="mt-2">
        <RouletteWheel
          segments={segments}
          // Si la sala ya está finalizada, mostramos la rueda apuntando al ganador
          targetIndex={room.state === "FINISHED" && finishedWinnerIndex >= 0 ? finishedWinnerIndex : targetIndex}
          spinKey={spinKey}
          onSpinEnd={onSpinEnd}
          size={380}            // puedes subir a 420 si quieres
          spinDurationMs={4200} // duración del giro
        />
      </div>

      {/* ===== Slots (lista textual) ===== */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: room.capacity }).map((_, i) => {
          const entry = room.entries?.find((e) => e.position === i + 1);
          const isWinner =
            !!room.winningEntryId && entry?.id === room.winningEntryId;
        return (
            <div key={i} className={`border rounded p-3 text-center ${isWinner ? "ring-2 ring-green-500" : ""}`}>
              <div className="font-medium">Puesto #{i + 1}</div>
              {entry ? (
                <div className="text-sm">
                  {entry.user.name || entry.user.email}
                </div>
              ) : (
                <div className="text-sm opacity-70">Libre</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== Botón de unirse ===== */}
      {room.state === "OPEN" && (
        <button
          onClick={join}
          disabled={joining || alreadyIn || free === 0}
          className="border px-4 py-2 rounded disabled:opacity-50"
        >
          {alreadyIn ? "Ya estás unido" : joining ? "Uniéndote..." : "Unirme"}
        </button>
      )}

      {/* ===== Estado LOCKED ===== */}
      {room.state === "LOCKED" && (
        <div className="p-4 border rounded space-y-3">
          <p className="opacity-80">Sala cerrada, esperando sorteo…</p>

          {/* Botón sortear aquí solo si eres admin (además del panel /admin) */}
          {role === "admin" && (
            <button
              onClick={sortear}
              disabled={finishing}
              className="border px-4 py-2 rounded disabled:opacity-50"
            >
              {finishing ? "Sorteando..." : "Sortear aquí"}
            </button>
          )}
        </div>
      )}

      {/* ===== Estado FINISHED ===== */}
      {room.state === "FINISHED" && (
        <div className="p-4 border rounded bg-green-50/10">
          <h2 className="font-semibold">¡Sala finalizada!</h2>
          <p>
            Premio:{" "}
            <strong>${room.prizeCents ? room.prizeCents / 100 : 0}</strong>
          </p>
          {room.winningEntryId ? (
            <p>
              Ganador:{" "}
              {room.entries?.find((e) => e.id === room.winningEntryId)?.user
                ?.name || "Desconocido"}
            </p>
          ) : (
            <p>No se registró el ganador.</p>
          )}
        </div>
      )}
    </main>
  );
}
