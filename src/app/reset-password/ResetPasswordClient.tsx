"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordClient() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get("token") ?? "";

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = !!token && pwd.length >= 6 && pwd === pwd2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pwd }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(d.error || "No se pudo cambiar la clave");
        return;
      }
      alert("Clave actualizada. Ahora puedes iniciar sesion.");
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border p-6 rounded-xl card">
        <h1 className="text-2xl font-semibold">Cambiar contrasena</h1>

        {!token ? (
          <p className="text-sm opacity-80">
            Falta el token en la URL. Pide un nuevo enlace al administrador.
          </p>
        ) : (
          <>
            <input
              className="w-full border p-2 rounded bg-transparent"
              type="password"
              placeholder="Nueva contrasena (min. 6)"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              minLength={6}
              required
            />
            <input
              className="w-full border p-2 rounded bg-transparent"
              type="password"
              placeholder="Repite la nueva contrasena"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              minLength={6}
              required
            />
            {pwd && pwd2 && pwd !== pwd2 && (
              <div className="text-xs text-red-300">Las contrasenas no coinciden.</div>
            )}
            <button disabled={!canSubmit || loading} className="w-full btn btn-primary disabled:opacity-50" type="submit">
              {loading ? "Guardando..." : "Cambiar contrasena"}
            </button>
          </>
        )}

        <p className="text-xs opacity-70">Si no solicitaste este cambio, ignora este enlace.</p>
      </form>
    </main>
  );
}

