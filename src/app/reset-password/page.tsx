// src/app/reset-password/page.tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// Componente que usa useSearchParams (debe estar dentro de Suspense)
function ResetPasswordForm() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  const router = useRouter();

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return alert("Token invalido");
    if (pw1.length < 6) return alert("La contrasena debe tener al menos 6 caracteres");
    if (pw1 !== pw2) return alert("Las contrasenas no coinciden");

    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || "No se pudo cambiar la contrasena");
      alert("Contrasena actualizada. Ahora puedes iniciar sesion.");
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border p-6 rounded-xl">
        <h1 className="text-2xl font-semibold">Restablecer contrasena</h1>

        <input
          type="password"
          className="w-full border p-2 rounded"
          placeholder="Nueva contrasena"
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          required
        />

        <input
          type="password"
          className="w-full border p-2 rounded"
          placeholder="Repetir contrasena"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          required
        />

        <button disabled={loading} className="w-full border p-2 rounded font-medium">
          {loading ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </main>
  );
}

// Pagina que envuelve en Suspense (requerido por useSearchParams)
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-[calc(100vh-64px)] grid place-items-center p-6">Cargando…</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

