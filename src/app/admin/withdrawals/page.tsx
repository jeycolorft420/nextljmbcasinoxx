// src/app/admin/withdrawals/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { pusherClient } from "@/lib/pusher-client";

type Withdrawal = {
  id: string;
  user: { email: string; name?: string | null };
  amountCents: number;
  wallet: string;
  status: "pending" | "finished" | "rejected";
  createdAt: string;
  updatedAt?: string;
};

export default function AdminWithdrawalsPage() {
  // Estado principal separado en secciones
  const [pending, setPending] = useState<Withdrawal[]>([]);
  const [recentReviewed, setRecentReviewed] = useState<Withdrawal[]>([]);
  const [searchResults, setSearchResults] = useState<Withdrawal[] | null>(null);

  // UI / control
  const [searchEmail, setSearchEmail] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // Evitar cargas paralelas
  const loadingRef = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helpers
  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      // pendientes
      const r1 = await fetch("/api/admin/withdrawals?status=pending", { cache: "no-store" });
      const p = r1.ok ? await r1.json() : [];

      // últimos 5 revisados
      const r2 = await fetch("/api/admin/withdrawals?recent=5", { cache: "no-store" });
      const rr = r2.ok ? await r2.json() : [];

      setPending(p);
      setRecentReviewed(rr);
    } finally {
      loadingRef.current = false;
    }
  };

  // Búsqueda por email (solo al enviar)
  const doSearch = async () => {
    const q = searchEmail.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const r = await fetch(`/api/admin/withdrawals?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      setSearchResults(data);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    load();

    const ch = pusherClient.subscribe("admin-withdrawals");

    const onCreated = (w: Withdrawal) => {
      // Solo va a "pendientes" si llega con pending
      if (w.status === "pending") {
        setPending((prev) => (prev.some((x) => x.id === w.id) ? prev : [{ ...w }, ...prev]));
      }
      // Si hay resultados de búsqueda activos y coincide, lo agregamos ahí también
      setSearchResults((prev) => {
        if (!prev) return prev;
        if (prev.some((x) => x.id === w.id)) return prev;
        return [{ ...w }, ...prev];
      });
    };

    const onChanged = (payload: { id: string; status: Withdrawal["status"] }) => {
      // Actualizar pendiente → si cambia a finished/rejected, lo sacamos de pendientes
      setPending((prev) => {
        const idx = prev.findIndex((w) => w.id === payload.id);
        if (idx === -1) return prev;
        // remove from pending if no longer pending
        if (payload.status !== "pending") {
          const copy = prev.slice();
          copy.splice(idx, 1);
          return copy;
        } else {
          // sigue pendiente: sólo actualizamos estado
          const copy = prev.slice();
          copy[idx] = { ...copy[idx], status: payload.status };
          return copy;
        }
      });

      // Si pasa a finished/rejected, puede entrar al bloque "recentReviewed" (tope 5 por updatedAt desc)
      if (payload.status === "finished" || payload.status === "rejected") {
        // Hacemos una recarga suave del bloque de revisados (para conservar orden por updatedAt)
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(async () => {
          try {
            const r = await fetch("/api/admin/withdrawals?recent=5", { cache: "no-store" });
            if (r.ok) {
              const data = await r.json();
              setRecentReviewed(data);
            }
          } finally {
            // noop
          }
        }, 150);
      }

      // Refrescar en resultados de búsqueda si están activos
      setSearchResults((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((w) => w.id === payload.id);
        if (idx === -1) return prev;
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], status: payload.status };
        return copy;
      });
    };

    ch.bind("withdrawals:created", onCreated);
    ch.bind("withdrawals:changed", onChanged);

    return () => {
      try {
        ch.unbind("withdrawals:created", onCreated);
        ch.unbind("withdrawals:changed", onChanged);
        pusherClient.unsubscribe("admin-withdrawals");
      } catch {}
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, []);

  const mark = async (id: string, status: Withdrawal["status"]) => {
    // Optimista: si está en pendientes, lo actualizamos
    setPending((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)));
    // También en resultados de búsqueda si están visibles
    setSearchResults((prev) => (prev ? prev.map((w) => (w.id === id ? { ...w, status } : w)) : prev));

    const r = await fetch(`/api/admin/withdrawals/${id}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!r.ok) {
      await load();
      const d = await r.json().catch(() => ({}));
      alert(d.error || "No se pudo actualizar el retiro");
    }
  };

  const Card = ({ w }: { w: Withdrawal }) => (
    <div className="card flex justify-between items-center p-3">
      <div>
        <div className="font-medium">{w.user.name || w.user.email}</div>
        <div className="text-sm opacity-80">
          ${(w.amountCents / 100).toFixed(2)} → {w.wallet}
        </div>
        <div className="text-xs opacity-60">
          {w.status.toUpperCase()} — {new Date(w.createdAt).toLocaleString()}
        </div>
      </div>

      {w.status === "pending" ? (
        <div className="flex gap-2">
          <button onClick={() => mark(w.id, "finished")} className="btn btn-primary text-xs">
            Finalizar
          </button>
          <button onClick={() => mark(w.id, "rejected")} className="btn btn-danger text-xs">
            Rechazar
          </button>
        </div>
      ) : (
        <span className={`badge ${w.status === "finished" ? "badge-success" : "badge-warn"}`}>
          {w.status.toUpperCase()}
        </span>
      )}
    </div>
  );

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">Retiros</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn text-sm">⟳ Refrescar</button>
        </div>
      </div>

      {/* Buscador por email (no en vivo; solo al enviar) */}
      <div className="rounded border border-white/10 p-3 space-y-2">
        <label className="text-xs opacity-80">Buscar retiros por email</label>
        <div className="flex gap-2">
          <input
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            placeholder="correo@dominio.com"
            className="flex-1 bg-transparent border rounded px-3 py-2 text-sm"
            type="email"
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
          />
          <button onClick={doSearch} className="btn" disabled={searchLoading}>
            {searchLoading ? "Buscando…" : "Buscar"}
          </button>
          {searchResults && (
            <button onClick={() => setSearchResults(null)} className="btn btn-ghost">
              Limpiar
            </button>
          )}
        </div>

        {searchResults && (
          <div className="mt-3">
            <div className="text-xs opacity-70 mb-1">Resultados ({searchResults.length})</div>
            <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
              {searchResults.length === 0 ? (
                <div className="card p-4 text-sm opacity-70">Sin resultados.</div>
              ) : (
                searchResults.map((w) => <Card key={w.id} w={w} />)
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pendientes */}
      <section className="space-y-2">
        <div className="text-xs opacity-70">Pendientes ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="card p-6 text-center text-sm opacity-70">Sin retiros pendientes.</div>
        ) : (
          <div className="space-y-2">
            {pending.map((w) => <Card key={w.id} w={w} />)}
          </div>
        )}
      </section>

      {/* Últimos revisados (5) */}
      <section className="space-y-2">
        <div className="text-xs opacity-70">Últimos revisados (5)</div>
        {recentReviewed.length === 0 ? (
          <div className="card p-6 text-center text-sm opacity-70">No hay revisados recientes.</div>
        ) : (
          <div className="space-y-2">
            {recentReviewed.map((w) => (
              <div key={w.id} className="card flex justify-between items-center p-3">
                <div>
                  <div className="font-medium">{w.user.name || w.user.email}</div>
                  <div className="text-sm opacity-80">
                    ${(w.amountCents / 100).toFixed(2)} → {w.wallet}
                  </div>
                  <div className="text-xs opacity-60">
                    {w.status.toUpperCase()} — {new Date(w.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={`badge ${w.status === "finished" ? "badge-success" : "badge-warn"}`}>
                  {w.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
