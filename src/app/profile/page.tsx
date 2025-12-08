"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import TwoFactorSetup from "@/modules/auth/components/TwoFactorSetup";
import VerificationUpload from "@/modules/auth/components/VerificationUpload";
import { AVATARS } from "@/modules/users/lib/avatars";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Me = {
  name: string | null;
  email: string;
  role: string;
  referralCode?: string | null;
  createdAt: string;
  twoFactorEnabled?: boolean;
  avatarUrl?: string | null;
  verificationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  documentUrl?: string | null;
  rejectionReason?: string | null;
};

export default function ProfilePage() {
  const { status, update } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Name
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/me/profile", { cache: "no-store" });
      const d = await r.json().catch(() => null);

      if (r.ok && d) {
        setMe(d);
        setName(d?.name ?? "");
      } else {
        toast.error(d?.error || "Error al cargar perfil");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error de conexión");
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
    if (!name.trim()) return toast.error("Escribe un nombre");
    setSaving(true);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return toast.error(d.error || "No se pudo guardar");
      setMe(d.user);
      await update();
      toast.success("Nombre actualizado");
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
        await update();
        toast.success("Avatar actualizado");
      } else {
        toast.error("Error al actualizar avatar");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar avatar");
    } finally {
      setSavingAvatar(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin opacity-50" size={32} />
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="max-w-4xl mx-auto px-3 py-6 text-center">
        <p>Inicia sesión para ver tu perfil.</p>
      </main>
    );
  }

  if (!loading && !me) {
    return (
      <main className="max-w-4xl mx-auto px-3 py-6 text-center">
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-red-500">Error al cargar perfil</h2>
          <p className="text-white/60 mt-2">No se pudo obtener la información del usuario.</p>
          <button onClick={load} className="btn btn-primary mt-4">Reintentar</button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <div className="md:hidden w-12 h-12 rounded-full overflow-hidden relative">
          {me?.avatarUrl ? (
            <Image src={me.avatarUrl} alt="Avatar" fill className="object-cover" />
          ) : (
            <div className="w-full h-full bg-primary flex items-center justify-center text-white font-bold">
              {me?.name?.charAt(0) || "U"}
            </div>
          )}
        </div>
        <h1 className="text-3xl font-bold">Mi Perfil</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Columna Izquierda: Identidad y Datos */}
        <div className="space-y-6">
          <div className="card bg-[#131b2e] border border-white/10 p-6 rounded-2xl">
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="w-32 h-32 rounded-full overflow-hidden bg-black/40 border-4 border-white/5 relative group shadow-xl">
                {me?.avatarUrl ? (
                  <Image src={me.avatarUrl} alt="Avatar" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/20 text-4xl font-bold text-primary">
                    {me?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
                {savingAvatar && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                    <Loader2 className="animate-spin text-white" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2">
                {AVATARS.slice(0, 5).map((avatar, i) => (
                  <button
                    key={i}
                    onClick={() => selectAvatar(avatar.src)}
                    className="w-8 h-8 rounded-full overflow-hidden border border-white/10 hover:scale-110 transition-transform bg-black/40 hover:border-white/50"
                  >
                    <Image src={avatar.src} alt={avatar.name} width={32} height={32} />
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-white/40 ml-1">Nombre</label>
                <input
                  className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm font-semibold"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-white/40 ml-1">Email</label>
                <input
                  className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-white text-sm font-mono cursor-not-allowed opacity-80"
                  value={me?.email || "Cargando..."}
                  disabled
                />
              </div>
              <button disabled={saving} className="btn btn-primary w-full shadow-lg shadow-primary/20">
                {saving ? <Loader2 className="animate-spin mx-auto" /> : "Guardar Cambios"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="text-xs text-center text-white/30">
                Miembro desde {me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : "-"}
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Verificación y Seguridad */}
        <div className="lg:col-span-2 space-y-6">
          {/* Componente de Verificación (KYC) */}
          <div className="card bg-[#131b2e] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-1">
              <VerificationUpload
                status={me?.verificationStatus ?? "PENDING"}
                hasDocuments={!!me?.documentUrl}
                rejectionReason={me?.rejectionReason ?? undefined}
              />
              {me?.verificationStatus === "PENDING" && me?.documentUrl && (
                <div className="px-6 pb-4 text-xs text-yellow-400/80 text-center">
                  (Esperando aprobación manual del Administrador)
                </div>
              )}
            </div>
          </div>

          {/* 2FA - Solo para GOD */}
          {me?.role === "god" && (
            <div className="card bg-[#131b2e] border border-white/10 p-6 rounded-2xl">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-primary">🛡️</span> Seguridad
              </h3>
              <TwoFactorSetup enabled={!!me?.twoFactorEnabled} onEnabled={() => load()} />
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

