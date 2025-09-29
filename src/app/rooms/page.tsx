"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type State = "OPEN" | "LOCKED" | "FINISHED";
type Room = {
  id: string;
  title: string;
  priceCents: number;
  state: State;
  capacity: number;
  slots?: { taken: number; free: number };
};

const TABS: { key: State | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "OPEN", label: "Abiertas" },
  { key: "LOCKED", label: "Cerradas" },
  { key: "FINISHED", label: "Finalizadas" },
];

export default function RoomsPage() {
  const [active, setActive] = useState<State | "ALL">("OPEN");
  const [data, setData] = useState<Record<State, Room[]>>({
    OPEN: [],
    LOCKED: [],
    FINISHED: [],
  });
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchState = async (s: State) =>
    (await fetch(`/api/rooms?state=${s}`, { cache: "no-store" }).then((r) =>
      r.ok ? r.json() : []
    )) as Room[];

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

  useEffect(() => {
    load();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 3000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []); // eslint-disable-line

  const list = useMemo(() => {
    if (active === "ALL") {
      return [...data.OPEN, ...data.LOCKED, ...data.FINISHED];
    }
    return data[active];
  }, [active, data]);

  const count = (s: State) => data[s]?.length ?? 0;

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Salas</h1>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key as any)}
            className={`rounded px-3 py-1 border text-sm ${
              active === t.key ? "bg-white/10" : "hover:bg-white/10"
            }`}
          >
            {t.label}
            {t.key !== "ALL" && (
              <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs">
                {count(t.key as State)}
              </span>
            )}
          </button>
        ))}
        <button onClick={load} className="ml-auto rounded px-3 py-1 border text-sm">
          Refrescar
        </button>
      </div>

      {/* Lista */}
      {loading && list.length === 0 ? (
        <p>Cargando…</p>
      ) : list.length === 0 ? (
        <p>No hay salas en esta vista.</p>
      ) : (
        <div className="grid gap-3">
          {list.map((r) => (
            <Link
              key={r.id}
              href={`/rooms/${r.id}`}
              className="block border rounded p-4 hover:bg-white/5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm opacity-80">
                    ${r.priceCents / 100} · Estado: {r.state} ·{" "}
                    {r.slots?.taken ?? 0}/{r.capacity}
                  </div>
                </div>
                <span className="underline text-sm">ver</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
