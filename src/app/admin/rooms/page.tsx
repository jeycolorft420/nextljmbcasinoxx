"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

type State = "OPEN" | "LOCKED" | "FINISHED" | "ARCHIVED" | "DRAWING";
type Room = {
  id: string;
  title: string;
  priceCents: number;
  state: State;
  capacity: number;
  createdAt: string;
  slots?: { taken: number; free: number };
};

const TIERS = [100, 2000, 5000, 10000]; // $1, $20, $50, $100
const TABS: { key: State | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "OPEN", label: "Abiertas" },
  { key: "LOCKED", label: "Cerradas" },
  { key: "FINISHED", label: "Finalizadas" },
];

export default function AdminRoomsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role as "admin" | "user" | undefined;

  const [active, setActive] = useState<State | "ALL">("OPEN");
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

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchState = async (s: "OPEN" | "LOCKED" | "FINISHED") =>
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
    if (status === "authenticated" && role === "admin") {
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
    }
  }, [status, role]); // eslint-disable-line

  const list = useMemo(() => {
    if (active === "ALL") {
      return [...data.OPEN, ...data.LOCKED, ...data.FINISHED];
    }
    return data[active as "OPEN" | "LOCKED" | "FINISHED"];
  }, [active, data]);

  const count = (s: "OPEN" | "LOCKED" | "FINISHED") => data[s]?.length ?? 0;

  // ---- acciones ----
  const createRoom = async (priceCents: number) => {
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceCents }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || "No se pudo crear la sala");
    await load();
  };

  const fill = async (id: string, count?: number) => {
    const r = await fetch(`/api/rooms/${id}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(count ? { count } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || "No se pudo llenar");
    await load();
  };

  const reset = async (id: string) => {
    if (!confirm("¿Seguro que quieres vaciar la sala y reabrirla?")) return;
    const r = await fetch(`/api/rooms/${id}/reset`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return alert(d.error || "No se pudo resetear");
    await load();
  };

  const finish = async (id: string) => {
    if (finishingId) return;
    setFinishingId(id);
    try {
      const r = await fetch(`/api/rooms/${id}/finish`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || `Error ${r.status}`);

      // Compatibilidad: usamos winnerName/winnerPosition si vienen,
      // o caemos al objeto winner plano antiguo.
      const name =
        d.winnerName ??
        d.winner?.name ??
        d.winner?.user?.name ??
        d.winner?.email ??
        "desconocido";
      const pos = d.winnerPosition ?? d.winner?.position ?? "-";

      alert(`Ganador: ${name} · Puesto #${pos} · Premio: $${(d.prizeCents ?? 0) / 100}`);
      await load();
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
      await load();
    } finally {
      setPresetId(null);
    }
  };

  // ---- guards ----
  if (status === "loading") return <main className="p-6">Cargando sesión…</main>;
  if (status === "unauthenticated") {
    signIn(undefined, { callbackUrl: "/admin/rooms" });
    return null;
  }
  if (role !== "admin") return <main className="p-6">No autorizado</main>;

  // ---- UI ----
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Admin · Salas</h1>

      {/* Acciones rápidas */}
      <div className="flex flex-wrap items-center gap-2">
        {TIERS.map((p) => (
          <button key={p} onClick={() => createRoom(p)} className="border px-3 py-1 rounded">
            Crear ${p / 100}
          </button>
        ))}
        <button onClick={load} className="ml-auto border px-3 py-1 rounded">
          Refrescar
        </button>
      </div>

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
                {count(t.key as "OPEN" | "LOCKED" | "FINISHED")}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading && list.length === 0 ? (
        <p>Cargando…</p>
      ) : list.length === 0 ? (
        <p>No hay salas en esta vista.</p>
      ) : (
        <div className="grid gap-3">
          {list.map((r) => {
            const taken = r.slots?.taken ?? 0;
            const free = r.capacity - taken;
            return (
              <div key={r.id} className="border rounded p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-sm opacity-80">
                      ${r.priceCents / 100} · Estado: {r.state} · {taken}/{r.capacity}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/rooms/${r.id}`} className="underline text-sm">
                      ver
                    </Link>

                    {r.state !== "FINISHED" && (
                      <>
                        <button onClick={() => fill(r.id, 1)} className="border px-2 py-1 rounded text-sm">
                          Llenar x1
                        </button>
                        <button onClick={() => fill(r.id, 3)} className="border px-2 py-1 rounded text-sm">
                          Llenar x3
                        </button>
                        {free > 0 && (
                          <button onClick={() => fill(r.id)} className="border px-2 py-1 rounded text-sm">
                            Llenar resto
                          </button>
                        )}
                        <button
                          onClick={() => presetWinner(r.id)}
                          disabled={presetId === r.id}
                          className="border px-2 py-1 rounded text-sm disabled:opacity-50"
                          title="Preseleccionar por posición (1..12)"
                        >
                          Preseleccionar
                        </button>
                      </>
                    )}

                    <button onClick={() => reset(r.id)} className="border px-2 py-1 rounded text-sm">
                      Reset
                    </button>

                    {r.state === "LOCKED" && (
                      <button
                        onClick={() => finish(r.id)}
                        disabled={finishingId === r.id}
                        className="border px-3 py-1 rounded text-sm disabled:opacity-50"
                      >
                        {finishingId === r.id ? "Sorteando…" : "Sortear"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
