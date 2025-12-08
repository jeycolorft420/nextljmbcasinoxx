// src/app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { pusherClient } from "@/modules/ui/lib/pusher-client";
import Image from "next/image";

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
      userAvatar={user?.avatarUrl}
    />
  );
}

/** ---------- DASHBOARD autenticado (todos los hooks viven aquí) ---------- */
function DashboardAuthed({
  userId,
  userName,
  userEmail,
  userAvatar,
}: {
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  userAvatar?: string | null;
}) {
  // ---- STATE ----
  const [summary, setSummary] = useState<RefSummary | null>(null);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "transfer">("deposit");

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
    } catch { }
  };
  const loadWithdrawals = async () => {
    try {
      const r = await fetch("/api/me/withdrawals", { cache: "no-store" });
      if (r.ok) setMyWithdrawals(await r.json());
    } catch { }
  };
  const loadPayments = async () => {
    try {
      const r = await fetch("/api/me/payments", { cache: "no-store" });
      if (r.ok) setMyPayments(await r.json());
    } catch { }
  };
  const loadTransfers = async () => {
    try {
      const r = await fetch("/api/me/transfers", { cache: "no-store" });
      if (r.ok) setMyTransfers(await r.json());
    } catch { }
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
        loadSummary().catch(() => { });
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
      } catch { }
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
    <main className="max-w-6xl mx-auto space-y-6 px-4 py-6">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white/10 shadow-lg">
          {userAvatar ? (
            <Image src={userAvatar} alt="Avatar" fill className="object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold">
              {userName?.[0]?.toUpperCase() || "U"}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">Hola, {userName || "Jugador"}</h1>
          <p className="text-sm opacity-60">{userEmail}</p>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-6 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <div className="text-sm font-medium text-emerald-400 mb-1 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            Saldo Disponible
          </div>
          <div className="text-3xl font-bold text-white">${balance}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm font-medium opacity-70 mb-1 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" x2="20" y1="8" y2="14" /><line x1="23" x2="17" y1="11" y2="11" /></svg>
            Ganancias Referidos
          </div>
          <div className="text-3xl font-bold">${refEarn}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm font-medium opacity-70 mb-1 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            Referidos Activos
          </div>
          <div className="text-3xl font-bold">{summary?.referralsCount ?? 0}</div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Action Center */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-0 overflow-hidden border-white/10">
            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab("deposit")}
                className={`flex-1 py-4 text-sm font-medium transition-colors relative
                  ${activeTab === "deposit" ? "text-white bg-white/5" : "text-white/50 hover:text-white hover:bg-white/5"}`}
              >
                Recargar
                {activeTab === "deposit" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
              <button
                onClick={() => setActiveTab("withdraw")}
                className={`flex-1 py-4 text-sm font-medium transition-colors relative
                  ${activeTab === "withdraw" ? "text-white bg-white/5" : "text-white/50 hover:text-white hover:bg-white/5"}`}
              >
                Retirar
                {activeTab === "withdraw" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
              <button
                onClick={() => setActiveTab("transfer")}
                className={`flex-1 py-4 text-sm font-medium transition-colors relative
                  ${activeTab === "transfer" ? "text-white bg-white/5" : "text-white/50 hover:text-white hover:bg-white/5"}`}
              >
                Transferir
                {activeTab === "transfer" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-6 min-h-[300px]">
              {activeTab === "deposit" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-500/10 rounded-xl text-green-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Recargar Saldo</h2>
                      <p className="text-sm opacity-60">Aceptamos criptomonedas vía NOWPayments.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <label className="text-xs font-bold uppercase opacity-50 mb-1.5 block">Monto a recargar (USD)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                        <input
                          type="number"
                          min={15}
                          step="0.01"
                          value={topUpUsd}
                          onChange={(e) => setTopUpUsd(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-lg pl-7 pr-3 py-3 text-lg font-bold focus:ring-2 focus:ring-primary/50 outline-none transition"
                          placeholder="15.00"
                        />
                      </div>
                      <button
                        disabled={loadingTopUp}
                        onClick={doDeposit}
                        className="btn btn-primary px-6"
                      >
                        {loadingTopUp ? "Procesando..." : "Pagar"}
                      </button>
                    </div>
                    <p className="text-xs opacity-50 mt-2">Mínimo $15.00 USD. Se acredita automáticamente tras 1 confirmación.</p>
                  </div>
                </div>
              )}

              {activeTab === "withdraw" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-xl text-orange-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Solicitar Retiro</h2>
                      <p className="text-sm opacity-60">Retiros en USDT (Red Polygon).</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold uppercase opacity-50 mb-1.5 block">Monto (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                        <input
                          type="number"
                          min={10}
                          step="0.01"
                          value={wdUsd}
                          onChange={(e) => setWdUsd(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-lg pl-7 pr-3 py-3 font-bold outline-none focus:border-primary/50 transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase opacity-50 mb-1.5 block">Dirección de Wallet (Polygon)</label>
                      <input
                        value={wdWallet}
                        onChange={(e) => setWdWallet(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 font-mono text-sm outline-none focus:border-primary/50 transition"
                        placeholder="0x..."
                      />
                    </div>
                    <button
                      disabled={loadingWd}
                      onClick={doWithdraw}
                      className="btn btn-primary w-full py-3 mt-2"
                    >
                      {loadingWd ? "Solicitando..." : "Confirmar Retiro"}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "transfer" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">Transferencia Interna</h2>
                      <p className="text-sm opacity-60">Envía saldo a otro usuario sin comisiones.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold uppercase opacity-50 mb-1.5 block">Email del destinatario</label>
                      <input
                        value={toEmail}
                        onChange={(e) => setToEmail(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 outline-none focus:border-primary/50 transition"
                        placeholder="usuario@email.com"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase opacity-50 mb-1.5 block">Monto (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                        <input
                          type="number"
                          min={1}
                          step="0.01"
                          value={trUsd}
                          onChange={(e) => setTrUsd(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-lg pl-7 pr-3 py-3 font-bold outline-none focus:border-primary/50 transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase opacity-50 mb-1.5 block">Nota (Opcional)</label>
                      <input
                        value={trNote}
                        onChange={(e) => setTrNote(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 outline-none focus:border-primary/50 transition"
                        placeholder="Regalo, Pago, etc."
                      />
                    </div>
                  </div>
                  <button
                    disabled={loadingTr}
                    onClick={doTransfer}
                    className="btn btn-primary w-full py-3 mt-2"
                  >
                    {loadingTr ? "Enviando..." : "Enviar Fondos"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar Info */}
        <div className="space-y-6">

          {/* Referral Card */}
          <div className="card p-5 space-y-4 bg-gradient-to-b from-white/5 to-transparent">
            <h3 className="font-bold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></svg>
              Invita y Gana
            </h3>
            <p className="text-xs opacity-60">
              Comparte tu código y gana el 10% de todos los depósitos de tus referidos.
            </p>

            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <div className="text-xs opacity-50 mb-1">Tu Código</div>
              <div className="text-xl font-mono font-bold tracking-widest text-primary">{summary?.referralCode || "..."}</div>
            </div>

            <div className="flex gap-2">
              <input
                readOnly
                value={summary?.referralUrl ?? ""}
                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 text-xs text-white/70 truncate"
              />
              <button onClick={copyReferral} className="btn btn-sm btn-outline">
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-white/5">
              <h3 className="font-bold text-sm">Actividad Reciente</h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {/* Combine and sort lists locally for display if needed, or just show sections */}

              {/* Withdrawals */}
              {myWithdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold">Retiro</div>
                      <div className="text-[10px] opacity-50">{new Date(w.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">-${(w.amountCents / 100).toFixed(2)}</div>
                    <div className={`text-[10px] uppercase ${w.status === 'finished' ? 'text-green-400' : 'text-yellow-400'}`}>{w.status}</div>
                  </div>
                </div>
              ))}

              {/* Payments */}
              {myPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold">Recarga</div>
                      <div className="text-[10px] opacity-50">{new Date(p.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-400">+${(p.amountCents / 100).toFixed(2)}</div>
                    <div className="text-[10px] opacity-50 uppercase">{p.status}</div>
                  </div>
                </div>
              ))}

              {/* Transfers */}
              {myTransfers.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" /></svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold">{t.direction === "out" ? "Envío" : "Recepción"}</div>
                      <div className="text-[10px] opacity-50">{t.counterparty}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${t.direction === "out" ? "text-red-400" : "text-green-400"}`}>
                      {t.direction === "out" ? "-" : "+"}${(t.amountCents / 100).toFixed(2)}
                    </div>
                    <div className="text-[10px] opacity-50">{new Date(t.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}

              {myWithdrawals.length === 0 && myPayments.length === 0 && myTransfers.length === 0 && (
                <div className="p-4 text-center text-xs opacity-50">
                  Sin actividad reciente.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

