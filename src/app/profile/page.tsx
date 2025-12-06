// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import TwoFactorSetup from "@/components/TwoFactorSetup";
import { AVATARS } from "@/lib/avatars";

type Me = {
  name: string | null;
  email: string;
  role: string;
  referralCode?: string | null;
  createdAt: string;
  twoFactorEnabled?: boolean;
  avatarUrl?: string | null;
};

export default function ProfilePage() {
  const { status, update } = useSession(); // update session after change
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // editar nombre
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

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
      await update(); // update session
      alert("Nombre actualizado");
    } finally {
      setSaving(false);
    }
  };

  const selectAvatar = async (avatarUrl: string) => {
    setSavingAvatar(true);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        setMe(prev => prev ? ({ ...prev, avatarUrl: data.user.avatarUrl }) : null);
        await update(); // update session
      } else {
        alert("Error al actualizar avatar");
      }
    } catch (err) {
      console.error(err);
      alert("Error al actualizar avatar");
    } finally {
      setSavingAvatar(false);
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
    <main className="max-w-4xl mx-auto px-3 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Perfil</h1>

      {/* Avatar Selection */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-base">Elige tu Avatar</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {AVATARS.map((avatar) => {
            const isSelected = me?.avatarUrl === avatar.src;
            return (
              <button
                key={avatar.id}
                onClick={() => selectAvatar(avatar.src)}
                disabled={savingAvatar}
                className={`group relative rounded-xl overflow-hidden border-2 transition-all text-left h-full flex flex-col ${isSelected
                  ? "border-primary shadow-[0_0_20px_rgba(16,185,129,0.3)] bg-primary/10"
                  : "border-white/10 hover:border-white/30 bg-black/20"
                  }`}
              >
                <div className="relative aspect-square w-full">
                  <Image
                    src={avatar.src}
                    alt={avatar.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[2px]">
                      <div className="bg-primary text-black rounded-full p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className={`font-bold text-sm mb-1 ${isSelected ? "text-primary" : "text-white"}`}>
                    {avatar.name}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {avatar.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

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

      {/* 2FA Section */}
      <section className="card space-y-3">
        {me?.twoFactorEnabled ? (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
            <div className="flex items-center gap-2 font-bold mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
              2FA Activado
            </div>
            <p className="text-sm opacity-80">Tu cuenta está protegida con autenticación de dos factores.</p>
          </div>
        ) : (
          <TwoFactorSetup onEnabled={() => setMe(prev => prev ? ({ ...prev, twoFactorEnabled: true }) : null)} />
        )}
      </section>
    </main>
  );
}
