// src/app/register/RegisterClient.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterClient() {
  const search = useSearchParams();
  const router = useRouter();

  const refFromUrl = (search.get("ref") || "").toUpperCase().trim();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = refFromUrl
        ? `/api/register?ref=${encodeURIComponent(refFromUrl)}`
        : `/api/register`;

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, refCode: refFromUrl || undefined }),
      });

      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(d.error || "No se pudo registrar");
        return;
      }

      alert("Cuenta creada ✅");
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-3 border rounded p-5 bg-black/30">
        <h1 className="text-xl font-bold">Crear cuenta</h1>

        {refFromUrl && (
          <p className="text-sm text-green-400">
            Te registras con código de referido: <b>{refFromUrl}</b>
          </p>
        )}

        <input className="w-full rounded border bg-transparent p-2" placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded border bg-transparent p-2" placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded border bg-transparent p-2" placeholder="Contraseña (mín. 8)" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />

        <button type="submit" disabled={loading} className="w-full rounded border px-4 py-2 disabled:opacity-50">
          {loading ? "Registrando..." : "Registrarme"}
        </button>
      </form>
    </main>
  );
}

