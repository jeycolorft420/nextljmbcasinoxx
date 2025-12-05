// src/app/rooms/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { pusherClient } from "@/lib/pusher-client";

type State = "OPEN" | "LOCKED" | "FINISHED";
type GameType = "ROULETTE" | "DICE_DUEL";
type Room = {
  id: string;
  title: string;
  priceCents: number;
  state: State;
  capacity: number;
  gameType: GameType;
  slots?: { taken: number; free: number };
};

const TABS: { key: State | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "OPEN", label: "Abiertas" },
  { key: "LOCKED", label: "Cerradas" },
  { key: "FINISHED", label: "Finalizadas" },
];

const GAME_TABS: { key: GameType | "ALL"; label: string }[] = [
  { key: "ROULETTE", label: "Ruleta" },
  { key: "DICE_DUEL", label: "Dados" },
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

export default function RoomsPage() {
  const [active, setActive] = useState<State | "ALL">("OPEN");
  const [game, setGame] = useState<GameType | "ALL">("ALL");

  const [data, setData] = useState<Record<State, Room[]>>({
    OPEN: [],
    LOCKED: [],
    FINISHED: [],
  });
  const [loading, setLoading] = useState(false);

  // --- Carga inicial por HTTP ---
  const fetchState = async (s: State) => {
    const params = new URLSearchParams({ state: s });
    if (game !== "ALL") params.set("gameType", game);
    const url = `/api/rooms?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    return (res.ok ? res.json() : []) as Promise<Room[]>;
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

  // --- Suscripción realtime a "public-rooms" ---
  useEffect(() => {
    // 1) primera carga
    load();

    // 2) suscribir
    const ch = pusherClient.subscribe("public-rooms");

    const onIndex = (payload: Room[]) => {
      // aplica filtro por juego al vuelo
      const filtered = game === "ALL" ? payload : payload.filter((r) => r.gameType === game);
      const open = filtered.filter((r) => r.state === "OPEN");
      const locked = filtered.filter((r) => r.state === "LOCKED");
      const finished = filtered.filter((r) => r.state === "FINISHED");
      setData({ OPEN: open, LOCKED: locked, FINISHED: finished });
    };

    ch.bind("rooms:index", onIndex);

    return () => {
      try { ch.unbind("rooms:index", onIndex); } catch {}
      try { pusherClient.unsubscribe("public-rooms"); } catch {}
    };
  }, [game]); // si cambia el filtro de juego, re-aplica

  const list = useMemo(() => {
    if (active === "ALL") return [...data.OPEN, ...data.LOCKED, ...data.FINISHED];
    return data[active];
  }, [active, data]);

  const count = (s: State) => data[s]?.length ?? 0;

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Salas</h1>
        <button onClick={load} className="btn text-sm" title="Refrescar">
          ⟳<span className="hidden sm:inline"> Refrescar</span>
        </button>
      </div>

      {/* Tabs por estado */}
      <div className="card p-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key as any)}
              className={`btn whitespace-nowrap ${active === t.key ? "btn-primary" : ""}`}
            >
              {t.label}
              {t.key !== "ALL" && <span className="ms-2 badge text-xs">{count(t.key as State)}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Filtro por juego */}
      <div className="card p-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
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

      {/* Lista */}
      {loading && list.length === 0 ? (
        <p className="opacity-80">Cargando…</p>
      ) : list.length === 0 ? (
        <div className="card text-center py-10">
          <div className="text-sm opacity-80">No hay salas en esta vista.</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => {
            const taken = r.slots?.taken ?? 0;
            const pct = Math.max(0, Math.min(100, (taken / r.capacity) * 100));
            return (
              <Link key={r.id} href={`/rooms/${r.id}`} className="card block hover:opacity-95 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-base font-semibold leading-tight line-clamp-1">{r.title}</div>
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

                <div className="mt-3">
                  <div className="btn btn-primary w-full text-center">Ver sala</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
