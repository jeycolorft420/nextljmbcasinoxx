// src/app/dashboard/page.tsx
"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type RefSummary = {
  balanceCents: number;
  referralCode: string;
  referralUrl: string;
  referralsCount: number;
  referralEarningsCents: number;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [summary, setSummary] = useState<RefSummary | null>(null);
  const [amount, setAmount] = useState<string>("1000");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const load = async () => {
    const r = await fetch("/api/referral/my", { cache: "no-store" });
    if (r.ok) setSummary(await r.json());
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  if (status !== "authenticated") return null;

  const doDeposit = async () => {
    const cents = Math.round(Number(amount));
    if (!Number.isFinite(cents) || cents <= 0) return alert("Monto inválido (centavos)");
    setLoading(true);
    try {
      const r = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || "No se pudo recargar");
      await load();
      alert(`Depósito OK: +$${(cents / 100).toFixed(2)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button className="border px-4 py-2 rounded" onClick={() => signOut({ callbackUrl: "/login" })}>
          Cerrar sesión
        </button>
      </div>

      <section className="border rounded p-4 space-y-2">
        <div className="text-lg">
          💰 Saldo: <strong>${((summary?.balanceCents ?? 0) / 100).toFixed(2)}</strong>
        </div>
        <div>
          Ganancias por referidos:{" "}
          <strong>${((summary?.referralEarningsCents ?? 0) / 100).toFixed(2)}</strong>
        </div>
        <div>Referidos activos: <strong>{summary?.referralsCount ?? 0}</strong></div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold text-lg">Tu enlace de referido</h2>
        <div className="text-sm opacity-80">Código: <code>{summary?.referralCode}</code></div>
        <div className="flex items-center gap-2">
          <input readOnly value={summary?.referralUrl ?? ""} className="w-full bg-transparent border rounded px-3 py-2" />
          <button onClick={() => summary?.referralUrl && navigator.clipboard.writeText(summary.referralUrl)}
                  className="border rounded px-3 py-2">
            Copiar
          </button>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold text-lg">Recargar (pruebas)</h2>
        <p className="text-sm opacity-80">Escribe el monto en <strong>centavos</strong> (1000 = $10.00)</p>
        <div className="flex items-center gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)}
                 className="w-40 bg-transparent border rounded px-3 py-2" placeholder="centavos" />
          <button disabled={loading} onClick={doDeposit} className="border rounded px-3 py-2 disabled:opacity-50">
            {loading ? "Procesando…" : "Depositar"}
          </button>
        </div>
      </section>
    </main>
  );
}
