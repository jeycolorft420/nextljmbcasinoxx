// src/app/admin/rooms/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { pusherClient } from "@/lib/pusher-client"; // 👈 NUEVO

type State = "OPEN" | "LOCKED" | "FINISHED" | "ARCHIVED" | "DRAWING";
type GameType = "ROULETTE" | "DICE_DUEL";

type Room = {
  id: string;
  title: string;
  priceCents: number;
  state: State;
  capacity: number;
  createdAt?: string;
  gameType: GameType;
  slots?: { taken: number; free: number };
};

const TIERS = [100, 500, 1000, 2000, 5000, 10000];

const TABS: { key: State | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "OPEN", label: "Abiertas" },
  { key: "LOCKED", label: "Cerradas" },
  { key: "FINISHED", label: "Finalizadas" },
];

const GAME_TABS: { key: GameType | "ALL"; label: string }[] = [
  { key: "ROULETTE", label: "Ruleta" },
  { key: "DICE_DUEL", label: "Dados 1v1" },
];

function stateBadgeClass(s: State) {
  if (s === "OPEN") return "badge badge-success";
  if (s === "LOCKED") return "badge badge-warn";
  if (s === "FINISHED") return "badge badge-info";
  return "badge";
}
function gameBadge(gt: GameType) {
  return <span className="badge text-[10px]">{gt === "ROULETTE" ? "Ruleta" : "Dados"}</span>;
}

export default function AdminRoomsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as "admin" | "user" | undefined;

  const [active, setActive] = useState<State | "ALL">("OPEN");
  const [game, setGame] = useState<GameType | "ALL">("ALL");

  const [data, setData] = useState<
    Record<Extract<State, "OPEN" | "LOCKED" | "FINISHED">, Room[]>
  >({
    OPEN: [],
    LOCKED: [],
    FINISHED: [],
  });
  const [loading, setLoading] = useState(false);

  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Carga inicial (fetch) — una vez
  const fetchState = async (s: "OPEN" | "LOCKED" | "FINISHED") => {
    const params = new URLSearchParams({ state: s });
    if (game !== "ALL") params.set("gameType", game);
    const url = `/api/rooms?${params.toString()}`;
    const r = await fetch(url, { cache: "no-store" });
    return (r.ok ? r.json() : []) as Promise<Room[]>;
  };
  const load = async () => {
    try {
      setLoading(true);
      const [open, locked, finished] = await Promise.all([
        fetchState("OPEN"),
        fetchState("LOCKED"),
        fetchState("FINISHED"),
      ]);
      setData({ OPEN: open, LOCKED: locked, FINISHED: finished });
    } finally {
      setLoading(false);
    }
  };

  // Suscripción realtime al índice global (sin polling)
  useEffect(() => {
    if (status !== "authenticated" || role !== "admin") return;

    // 1) Carga inicial (fetch)
    load();

    // 2) Suscribirse a "private-rooms"
    const ch = pusherClient.subscribe("private-rooms");

    const onIndex = (payload: Room[]) => {
      // aplica filtro por juego aquí
      const filtered = game === "ALL" ? payload : payload.filter(r => r.gameType === game);

      const open = filtered.filter((r) => r.state === "OPEN");
      const locked = filtered.filter((r) => r.state === "LOCKED");
      const finished = filtered.filter((r) => r.state === "FINISHED");
      setData({ OPEN: open, LOCKED: locked, FINISHED: finished });
    };

    ch.bind("rooms:index", onIndex);

    return () => {
      try { ch.unbind("rooms:index", onIndex); } catch {}
      try { pusherClient.unsubscribe("private-rooms"); } catch {}
    };
  }, [status, role, game]); // 👈 si cambias el filtro de juego, el handler se re-crea

  // Derivar lista para la tab activa
  const list = useMemo(() => {
    if (active === "ALL") {
      return [...data.OPEN, ...data.LOCKED, ...data.FINISHED];
    }
    return data[active as "OPEN" | "LOCKED" | "FINISHED"];
  }, [active, data]);

  const count = (s: "OPEN" | "LOCKED" | "FINISHED") => data[s]?.length ?? 0;

  // ---- acciones (sin cambios sustanciales) ----
  const createRoom = async (priceCents: number, gameType: GameType) => {
    const payload: any = { priceCents, gameType };
    if (gameType === "DICE_DUEL") payload.capacity = 2;
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || "No se pudo crear la sala");
    // load(); // ya no es necesario — realtime lo actualizará
  };

  const fill = async (id: string, count?: number) => {
    const r = await fetch(`/api/rooms/${id}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(count ? { count } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || "No se pudo llenar");
  };

  const reset = async (id: string) => {
    if (!confirm("¿Seguro que quieres vaciar la sala y reabrirla?")) return;
    const r = await fetch(`/api/rooms/${id}/reset`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || "No se pudo resetear");
  };

  const finish = async (id: string) => {
    if (finishingId) return;
    setFinishingId(id);
    try {
      const r = await fetch(`/api/rooms/${id}/finish`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || `Error ${r.status}`);

      const name =
        d.winnerName ?? d.winner?.name ?? d.winner?.user?.name ?? d.winner?.email ?? "desconocido";
      const pos = d.winnerPosition ?? d.winner?.position ?? "-";

      alert(`Ganador: ${name} · Puesto #${pos} · Premio: $${(d.prizeCents ?? 0) / 100}`);
    } finally {
      setFinishingId(null);
    }
  };

  const presetWinner = async (id: string) => {
    const raw = window.prompt("Posición preseleccionada (1..12):");
    if (!raw) return;
    const pos = parseInt(raw, 10);
    if (!Number.isInteger(pos) || pos < 1 || pos > 12) {
      alert("Posición inválida");
      return;
    }
    setPresetId(id);
    try {
      const r = await fetch(`/api/rooms/${id}/preset-winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: pos }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || `Error ${r.status}`);
      alert(`Preseleccionado puesto #${pos} para el próximo sorteo.`);
    } finally {
      setPresetId(null);
    }
  };

  const removeRoom = async (id: string, taken: number, state: State) => {
    if (state === "LOCKED" && taken > 0) {
      alert("Sala LOCKED con participantes. Ejecuta 'Reset' antes de eliminar.");
      return;
    }
    if (!confirm("¿Eliminar esta sala? Se ocultará de todos los listados.")) return;

    setDeletingId(id);
    try {
      const r = await fetch(`/api/rooms/${id}/delete`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || `Error ${r.status}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading") return <main className="p-6">Cargando sesión…</main>;
  if (status === "unauthenticated") {
    signIn(undefined, { callbackUrl: "/admin/rooms" });
    return null;
  }
  if (role !== "admin") return <main className="p-6">No autorizado</main>;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h1 className="text-xl font-bold">Admin · Salas</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn text-sm" title="Refrescar">
            ⟳ <span className="hidden sm:inline">Refrescar</span>
          </button>
          <button
            onClick={async () => {
              const r = await fetch("/api/payments/reprocess-pending", { method: "POST" });
              const d = await r.json().catch(() => ({}));
              if (!r.ok) return alert(d.error || "Error al reprocesar");
              alert(`Reprocesados: ${d.processed}\n${(d.orderIds || []).join("\n")}`);
            }}
            className="btn text-sm"
            title="Acredita pagos 'finished/confirmed' no acreditados"
          >
            ↻ <span className="hidden sm:inline">Reprocesar pagos</span>
          </button>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs opacity-70 shrink-0">Crear Ruleta:</span>
          {TIERS.map((p) => (
            <button
              key={`r-${p}`}
              onClick={() => createRoom(p, "ROULETTE")}
              className="btn btn-primary whitespace-nowrap"
              title={`Crear ruleta $${p / 100}`}
            >
              Ruleta ${p / 100}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs opacity-70 shrink-0">Crear Dados 1v1:</span>
          {TIERS.map((p) => (
            <button
              key={`d-${p}`}
              onClick={() => createRoom(p, "DICE_DUEL")}
              className="btn btn-primary whitespace-nowrap"
              title={`Crear dados $${p / 100} (capacidad 2)`}
            >
              Dados ${p / 100}
            </button>
          ))}
        </div>

        {/* Filtro por estado */}
        <div className="mt-1 flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key as any)}
              className={`btn whitespace-nowrap ${active === t.key ? "btn-primary" : ""}`}
            >
              {t.label}
              {t.key !== "ALL" && (
                <span className="ms-2 badge text-xs">{count(t.key as "OPEN" | "LOCKED" | "FINISHED")}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filtro por juego */}
        <div className="mt-1 flex gap-2 overflow-x-auto no-scrollbar">
          {GAME_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setGame(t.key as any)}
              className={`btn whitespace-nowrap ${game === t.key ? "btn-primary" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de salas */}
      {loading && [...data.OPEN, ...data.LOCKED, ...data.FINISHED].length === 0 ? (
        <p className="opacity-80">Cargando…</p>
      ) : list.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-sm opacity-80">No hay salas en esta vista.</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => {
            const taken = r.slots?.taken ?? 0;
            const free = r.capacity - taken;
            const disablingDelete = r.state === "LOCKED" && taken > 0;
            const pct = Math.max(0, Math.min(100, (taken / r.capacity) * 100));

            return (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-semibold leading-tight line-clamp-1">{r.title}</div>
                    <div className="flex items-center gap-2 text-xs opacity-70">
                      <span>${r.priceCents / 100}</span>
                      {gameBadge(r.gameType)}
                    </div>
                  </div>
                  <span className={stateBadgeClass(r.state)}>{r.state}</span>
                </div>

                <div className="mt-3">
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 text-xs opacity-75">
                    {taken}/{r.capacity} ocupados
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Link href={`/rooms/${r.id}`} className="btn btn-ghost text-sm text-center">ver</Link>

                  {r.state !== "FINISHED" && (
                    <>
                      <button onClick={() => fill(r.id, 1)} className="btn text-sm">Llenar x1</button>
                      <button onClick={() => fill(r.id, 3)} className="btn text-sm">Llenar x3</button>
                      {free > 0 && <button onClick={() => fill(r.id)} className="btn text-sm">Llenar resto</button>}
                      <button
                        onClick={() => r.gameType === "ROULETTE" && presetWinner(r.id)}
                        disabled={presetId === r.id || r.gameType !== "ROULETTE"}
                        className="btn text-sm disabled:opacity-50"
                        title={r.gameType === "ROULETTE" ? "Preseleccionar por posición (1..12)" : "No aplica para Dados"}
                      >
                        Preseleccionar
                      </button>
                    </>
                  )}

                  <button onClick={() => reset(r.id)} className="btn text-sm">Reset</button>

                  {r.state === "LOCKED" && (
                    <button
                      onClick={() => finish(r.id)}
                      disabled={finishingId === r.id}
                      className="btn text-sm disabled:opacity-50"
                    >
                      {finishingId === r.id ? "Sorteando…" : "Sortear"}
                    </button>
                  )}

                  <button
                    onClick={() => removeRoom(r.id, taken, r.state)}
                    disabled={deletingId === r.id || disablingDelete}
                    className="btn btn-danger text-sm disabled:opacity-50"
                    title={disablingDelete ? "LOCKED con participantes: haz Reset antes" : "Eliminar sala"}
                  >
                    {deletingId === r.id ? "Eliminando…" : "Eliminar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
