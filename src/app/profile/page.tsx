// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Me = {
  name: string | null;
  email: string;
  role: string;
  referralCode?: string | null;
  createdAt: string;
};

export default function ProfilePage() {
  const { status } = useSession(); // protegemos vista por cliente
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // editar nombre
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/me/profile", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setMe(d);
        setName(d?.name ?? "");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") load();
    if (status === "unauthenticated") setLoading(false);
  }, [status]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Escribe un nombre");
    setSaving(true);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return alert(d.error || "No se pudo guardar");
      setMe(d.user);
      alert("Nombre actualizado");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-3 py-6">
        <div className="opacity-80">Cargando…</div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="max-w-4xl mx-auto px-3 py-6">
        <h1 className="text-xl font-bold">Perfil</h1>
        <p className="opacity-80 mt-2">Debes iniciar sesión.</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-3 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Perfil</h1>

      {/* Editar nombre */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-base">Tu nombre</h2>
        <form onSubmit={save} className="flex flex-col sm:flex-row gap-2">
          <input
            className="w-full bg-transparent border rounded px-3 py-2 text-sm"
            placeholder="Nombre a mostrar"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <button className="btn btn-primary w-full sm:w-auto" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </form>
        {me?.name && (
          <div className="text-xs opacity-70">Actual: <strong>{me.name}</strong></div>
        )}
      </section>

      {/* Email */}
      <section className="card space-y-2">
        <div className="text-sm opacity-80">Email</div>
        <div className="text-lg">{me?.email}</div>
      </section>

      {/* Rol */}
      <section className="card space-y-2">
        <div className="text-sm opacity-80">Rol</div>
        <div className="text-lg">{me?.role}</div>
      </section>

      {/* Referido */}
      <section className="card space-y-2">
        <div className="text-sm opacity-80">Mi código de referido</div>
        <div className="text-lg">{me?.referralCode || "—"}</div>
      </section>

      {/* Cambio de clave por soporte */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-base">Cambio de clave</h2>
        <p className="text-sm opacity-80">
          El cambio de clave se gestiona por <strong>Soporte</strong>. Abre un chat y
          el equipo te ayudará a validar identidad y actualizar tu contraseña.
        </p>
        <a href="/support" className="btn btn-primary w-full sm:w-auto">Ir a Soporte</a>
      </section>
    </main>
  );
}
