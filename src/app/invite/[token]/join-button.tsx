"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinButton({ roomId }: { roomId: string }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const join = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(d.error || "No se pudo entrar a la sala");
        setLoading(false);
        return;
      }
      router.push(`/rooms/${roomId}`);
    } catch {
      alert("Error de red");
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback si falla el clipboard API
      window.prompt("Copia este enlace y compártelo:", url);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button onClick={join} className="btn btn-primary w-full" disabled={loading}>
        {loading ? "Entrando…" : "Unirme a la sala"}
      </button>

      <button
        onClick={copyLink}
        className="btn btn-ghost w-full text-sm"
        title="Copiar enlace de invitación"
      >
        {copied ? "✅ Link copiado" : "Copiar enlace de invitación"}
      </button>
    </div>
  );
}
