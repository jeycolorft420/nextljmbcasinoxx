// src/app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { pusherClient } from "@/lib/pusher-client";

type RefSummary = {
  balanceCents: number;
  referralCode: string;
  referralUrl: string;
  referralsCount: number;
  referralEarningsCents: number;
};

type MyWithdrawal = {
  id: string;
  amountCents: number;
  wallet: string;
  status: "pending" | "finished" | "rejected";
  createdAt: string;
};

type MyPayment = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
  npPaymentId?: string | null;
  orderId: string;
};

type MyTransfer = {
  id: string;
  amountCents: number;
  note?: string | null;
  createdAt: string;
  direction: "in" | "out";
  counterparty: string;
};

/** ---------- WRAPPER: mantiene el orden de hooks estable ---------- */
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirige cuando NO autenticado (sin montar el dashboard con más hooks)
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return null;

  const user = session?.user as any;
  return (
    <DashboardAuthed
      userId={user?.id}
      userName={user?.name}
      userEmail={user?.email}
    />
  );
}

/** ---------- DASHBOARD autenticado (todos los hooks viven aquí) ---------- */
function DashboardAuthed({
  userId,
  userName,
  userEmail,
}: {
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
}) {
  // ---- STATE ----
  const [summary, setSummary] = useState<RefSummary | null>(null);

  // Recarga (USD)
  const [topUpUsd, setTopUpUsd] = useState("15.00");
  const [loadingTopUp, setLoadingTopUp] = useState(false);

  // Retiro
  const [wdUsd, setWdUsd] = useState("10.00");
  const [wdWallet, setWdWallet] = useState("");
  const [loadingWd, setLoadingWd] = useState(false);
  const [myWithdrawals, setMyWithdrawals] = useState<MyWithdrawal[]>([]);

  // Transferencias
  const [toEmail, setToEmail] = useState("");
  const [trUsd, setTrUsd] = useState("1.00");
  const [trNote, setTrNote] = useState("");
  const [loadingTr, setLoadingTr] = useState(false);
  const [myPayments, setMyPayments] = useState<MyPayment[]>([]);
  const [myTransfers, setMyTransfers] = useState<MyTransfer[]>([]);

  // Feedback “copiado”
  const [copied, setCopied] = useState(false);

  // ---- LOADERS (carga inicial; luego los cambios llegan por Pusher) ----
  const loadSummary = async () => {
    try {
      const r = await fetch("/api/referral/my", { cache: "no-store" });
      if (r.ok) setSummary(await r.json());
    } catch {}
  };
  const loadWithdrawals = async () => {
    try {
      const r = await fetch("/api/me/withdrawals", { cache: "no-store" });
      if (r.ok) setMyWithdrawals(await r.json());
    } catch {}
  };
  const loadPayments = async () => {
    try {
      const r = await fetch("/api/me/payments", { cache: "no-store" });
      if (r.ok) setMyPayments(await r.json());
    } catch {}
  };
  const loadTransfers = async () => {
    try {
      const r = await fetch("/api/me/transfers", { cache: "no-store" });
      if (r.ok) setMyTransfers(await r.json());
    } catch {}
  };

  useEffect(() => {
    // carga inicial
    loadSummary();
    loadWithdrawals();
    loadPayments();
    loadTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ---- SUSCRIPCIÓN PUSHER (event-driven) ----
  useEffect(() => {
    if (!userId) return;

    // usamos canal privado (debe existir /api/pusher/auth)
    const channelName = `private-user-${userId}`;
    const channel = pusherClient.subscribe(channelName);

    // Saldo / summary
    const onWallet = (payload: { balanceCents: number }) => {
      setSummary((s) => (s ? { ...s, balanceCents: payload.balanceCents } : s));
    };

    // Nueva transferencia (entrante o saliente)
    const onTransfer = (t: MyTransfer) => {
      setMyTransfers((list) => [t, ...list].slice(0, 100));
      // refresca balance por si vino de otro origen
      loadSummary();
    };

    // Retiro actualizado por admin (solo status)
    const onWithdrawal = (p: { id: string; status: "pending" | "finished" | "rejected" }) => {
      setMyWithdrawals((list) => {
        const i = list.findIndex((x) => x.id === p.id);
        if (i === -1) return list; // si no está, puedes forzar loadWithdrawals()
        const clone = list.slice();
        clone[i] = { ...clone[i], status: p.status };
        return clone;
      });
      // si tu backend devuelve saldo al rechazar, actualiza el resumen
      if (p.status === "rejected" || p.status === "finished") {
        loadSummary().catch(() => {});
      }
    };

    // Recarga confirmada
    const onPaymentFinished = (p: MyPayment) => {
      setMyPayments((list) => [p, ...list].slice(0, 50));
      loadSummary();
    };

    channel.bind("wallet:balance", onWallet);
    channel.bind("transfer:new", onTransfer);
    channel.bind("withdrawal:updated", onWithdrawal);
    channel.bind("payment:finished", onPaymentFinished);

    return () => {
      try {
        channel.unbind("wallet:balance", onWallet);
        channel.unbind("transfer:new", onTransfer);
        channel.unbind("withdrawal:updated", onWithdrawal);
        channel.unbind("payment:finished", onPaymentFinished);
        pusherClient.unsubscribe(channelName);
      } catch {}
    };
  }, [userId]);

  // ---- HANDLERS ----
  const doDeposit = async () => {
    const usd = Number(topUpUsd);
    if (!Number.isFinite(usd) || usd <= 0) return alert("Monto inválido");
    if (usd < 15) return alert("La recarga mínima es $15.00");
    const cents = Math.round(usd * 100);

    setLoadingTopUp(true);
    try {
      const r = await fetch("/api/payments/nowpayments/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || "No se pudo crear la orden");

      if (d?.invoice_url) {
        const w = window.open(d.invoice_url, "_blank");
        if (!w) window.location.href = d.invoice_url;
      }
    } finally {
      setLoadingTopUp(false);
    }
  };

  const doWithdraw = async () => {
    const usd = Number(wdUsd);
    if (!Number.isFinite(usd) || usd <= 0) return alert("Monto inválido");
    const amountCents = Math.round(usd * 100);

    if (amountCents < 1000) return alert("El mínimo de retiro es $10.00");
    const balanceCents = summary?.balanceCents ?? 0;
    if (amountCents > balanceCents) return alert("Saldo insuficiente");
    if (!wdWallet || wdWallet.trim().length < 8) return alert("Wallet inválida");

    setLoadingWd(true);
    try {
      const r = await fetch("/api/me/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, wallet: wdWallet.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || "No se pudo crear el retiro");

      setWdUsd("10.00");
      setWdWallet("");
      await loadSummary();
      await loadWithdrawals();
      alert("Retiro creado. Estado: PENDING");
    } finally {
      setLoadingWd(false);
    }
  };

  const doTransfer = async () => {
    const usd = Number(trUsd);
    if (!Number.isFinite(usd) || usd <= 0) return alert("Monto inválido");
    const amountCents = Math.round(usd * 100);
    if (amountCents < 100) return alert("El mínimo a transferir es $1.00");
    const balanceCents = summary?.balanceCents ?? 0;
    if (amountCents > balanceCents) return alert("Saldo insuficiente");
    if (!toEmail || !toEmail.includes("@")) return alert("Email destino inválido");

    setLoadingTr(true);
    try {
      const r = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: toEmail.trim(), amountCents, note: trNote || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || "No se pudo transferir");

      setToEmail("");
      setTrUsd("1.00");
      setTrNote("");
      await loadSummary();
      await loadTransfers();
      alert("Transferencia enviada");
    } finally {
      setLoadingTr(false);
    }
  };

  const copyReferral = async () => {
    if (summary?.referralUrl) {
      await navigator.clipboard.writeText(summary.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  // ---- MEMOS ----
  const balance = useMemo(
    () => ((summary?.balanceCents ?? 0) / 100).toFixed(2),
    [summary?.balanceCents]
  );
  const refEarn = useMemo(
    () => ((summary?.referralEarningsCents ?? 0) / 100).toFixed(2),
    [summary?.referralEarningsCents]
  );

  // ---- UI ----
  return (
    <main className="max-w-5xl mx-auto space-y-4 px-2">
      {/* encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
        <div className="text-sm opacity-80">{userName || userEmail}</div>
      </div>

      {/* tarjetas superiores */}
      <section className="grid sm:grid-cols-3 gap-3">
        <div className="card py-3">
          <div className="text-xs opacity-70">Saldo</div>
          <div className="text-2xl font-semibold mt-1">${balance}</div>
        </div>
        <div className="card py-3">
          <div className="text-xs opacity-70">Ganancias por referidos</div>
          <div className="text-2xl font-semibold mt-1">${refEarn}</div>
        </div>
        <div className="card py-3">
          <div className="text-xs opacity-70">Referidos activos</div>
          <div className="text-2xl font-semibold mt-1">
            {summary?.referralsCount ?? 0}
          </div>
        </div>
      </section>

      {/* referido */}
      <section className="card space-y-2">
        <h2 className="font-semibold text-base">Tu enlace de referido</h2>
        <div className="text-xs opacity-80">
          Código: <code>{summary?.referralCode}</code>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={summary?.referralUrl ?? ""}
            className="w-full bg-transparent border rounded px-3 py-2 text-sm"
          />
          <button onClick={copyReferral} className="btn px-3 py-2">
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </section>

      {/* recarga */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-base">Recargar con crypto</h2>
        <p className="text-xs opacity-80">
          Escribe el monto en <strong>USD</strong> (mínimo <strong>$15.00</strong>). Se abrirá el
          checkout de NOWPayments.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="number"
            min={15}
            step="0.01"
            value={topUpUsd}
            onChange={(e) => setTopUpUsd(e.target.value)}
            className="w-full sm:w-56 bg-transparent border rounded px-3 py-2 text-right text-sm"
            placeholder="15.00"
          />
          <button
            disabled={loadingTopUp}
            onClick={doDeposit}
            className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
          >
            {loadingTopUp ? "Creando orden…" : "Recargar"}
          </button>
        </div>
        <div className="text-[11px] opacity-70">
          El 10% del depósito se acredita automáticamente al referidor cuando el pago queda
          <strong> CONFIRMED</strong>.
        </div>
      </section>

      {/* transferir */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-base">Transferir saldo</h2>
        <p className="text-xs opacity-80">
          Envía saldo a otro usuario usando su correo. Mínimo <strong>$1.00</strong>.
        </p>

        <div className="grid sm:grid-cols-3 gap-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs opacity-70">Email del destinatario</label>
            <input
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="w-full bg-transparent border rounded px-3 py-2 text-sm"
              placeholder="destinatario@correo.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs opacity-70">Monto (USD)</label>
            <input
              type="number"
              min={1}
              step="0.01"
              value={trUsd}
              onChange={(e) => setTrUsd(e.target.value)}
              className="w-full bg-transparent border rounded px-3 py-2 text-right text-sm"
              placeholder="1.00"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs opacity-70">Nota (opcional)</label>
          <input
            value={trNote}
            onChange={(e) => setTrNote(e.target.value)}
            className="w-full bg-transparent border rounded px-3 py-2 text-sm"
            placeholder="Gracias / Pago de sala / etc."
            maxLength={200}
          />
        </div>

        <div>
          <button
            disabled={loadingTr}
            onClick={doTransfer}
            className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
          >
            {loadingTr ? "Enviando…" : "Enviar transferencia"}
          </button>
        </div>
      </section>

      {/* retirar */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-base">Retirar</h2>
        <p className="text-xs opacity-80">
          Mínimo <strong>$10</strong>. <strong>Importante</strong> su wallet de retiro debe ser
          exclusivamente <strong>USDT</strong> en la red <strong>Polygon</strong>.
        </p>

        <div className="grid sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs opacity-70">Monto (USD)</label>
            <input
              type="number"
              min={10}
              step="0.01"
              value={wdUsd}
              onChange={(e) => setWdUsd(e.target.value)}
              className="w-full bg-transparent border rounded px-3 py-2 text-right text-sm"
              placeholder="10.00"
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs opacity-70">Wallet destino</label>
            <input
              value={wdWallet}
              onChange={(e) => setWdWallet(e.target.value)}
              className="w-full bg-transparent border rounded px-3 py-2 text-sm"
              placeholder="Tu dirección"
            />
          </div>
        </div>

        <div>
          <button
            disabled={loadingWd}
            onClick={doWithdraw}
            className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
          >
            {loadingWd ? "Creando retiro…" : "Solicitar retiro"}
          </button>
        </div>

        {/* Historial de retiros */}
        <div className="mt-2">
          <h3 className="font-medium text-sm mb-1">Tus últimos retiros</h3>
          {myWithdrawals.length === 0 ? (
            <div className="text-xs opacity-70">Sin retiros aún.</div>
          ) : (
            <div className="grid gap-2">
              {myWithdrawals.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between border rounded px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      ${(w.amountCents / 100).toFixed(2)}
                    </div>
                    <div className="text-[11px] opacity-70">
                      {new Date(w.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] opacity-80">{w.wallet}</div>
                    <div
                      className={`badge ${
                        w.status === "finished"
                          ? "badge-success"
                          : w.status === "rejected"
                          ? "badge-warn"
                          : ""
                      }`}
                    >
                      {w.status.toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* historial de recargas */}
      <section className="card space-y-2">
        <h2 className="font-semibold text-base">Historial de recargas</h2>
        {myPayments.length === 0 ? (
          <div className="text-xs opacity-70">Sin recargas aún.</div>
        ) : (
          <div className="grid gap-2">
            {myPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border rounded px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    ${(p.amountCents / 100).toFixed(2)} — {p.status.toUpperCase()}
                  </div>
                  <div className="text-[11px] opacity-70">
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right text-[11px] opacity-80">
                  orden: {p.orderId}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* historial de transferencias */}
      <section className="card space-y-2">
        <h2 className="font-semibold text-base">Historial de transferencias</h2>
        {myTransfers.length === 0 ? (
          <div className="text-xs opacity-70">Sin transferencias aún.</div>
        ) : (
          <div className="grid gap-2">
            {myTransfers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border rounded px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {t.direction === "out" ? "Enviado a" : "Recibido de"} {t.counterparty}
                  </div>
                  <div className="text-[11px] opacity-70">
                    {new Date(t.createdAt).toLocaleString()}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div
                  className={`font-semibold ${
                    t.direction === "out" ? "text-red-300" : "text-green-300"
                  }`}
                >
                  {t.direction === "out" ? "-" : "+"}${(t.amountCents / 100).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
