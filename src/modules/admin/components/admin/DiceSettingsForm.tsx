"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function DiceSettingsForm() {
    const [seconds, setSeconds] = useState<number>(600);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch("/api/admin/settings")
            .then(res => res.json())
            .then(data => {
                if (data.diceTimerSeconds) setSeconds(data.diceTimerSeconds);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ diceTimerSeconds: seconds })
            });
            if (!res.ok) throw new Error("Failed");
            toast.success("Configuración guardada");
        } catch (e) {
            toast.error("Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-xs opacity-50">Cargando configuración...</div>;

    return (
        <div className="card p-4 bg-[#111] border border-white/10 mb-6 flex items-center justify-between gap-4">
            <div>
                <h3 className="font-bold text-white">Tiempo de Espera por Defecto</h3>
                <p className="text-xs text-slate-400">Tiempo en segundos antes de iniciar con Bot si falta oponente.</p>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={seconds}
                    onChange={e => setSeconds(Math.max(10, parseInt(e.target.value) || 0))}
                    className="input input-sm w-32 bg-black/50 border-white/20"
                />
                <span className="text-xs opacity-50">segundos</span>
                <button
                    onClick={save}
                    disabled={saving}
                    className="btn btn-sm btn-primary ml-2"
                >
                    {saving ? "..." : "Guardar"}
                </button>
            </div>
        </div>
    );
}
