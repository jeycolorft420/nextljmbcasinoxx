// src/app/dashboard/ReferralBox.tsx
"use client";
import { useEffect, useState } from "react";

export default function ReferralBox() {
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string>("");
  const [link, setLink] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch("/api/referral/my", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) {
        setCode(d.code);
        setLink(d.link);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="mt-4 text-sm opacity-80">Cargando enlace de referido…</div>;

  return (
    <div className="mt-6 space-y-2 border rounded p-4">
      <div className="text-sm opacity-80">Tu enlace de referido</div>
      <div className="text-xs opacity-70">Código: <b>{code}</b></div>
      <div className="flex gap-2">
        <input className="flex-1 rounded border bg-transparent p-2" readOnly value={link} />
        <button className="border rounded px-3" onClick={() => navigator.clipboard.writeText(link)}>
          Copiar
        </button>
      </div>
    </div>
  );
}

