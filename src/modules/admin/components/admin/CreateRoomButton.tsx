"use client";

import { useState } from "react";

type Props = {
    price: number;
    type: "ROULETTE" | "DICE_DUEL";
    label: string;
};

export default function CreateRoomButton({ price, type, label }: Props) {
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [botInterval, setBotInterval] = useState("0");
    const [duration, setDuration] = useState("40");
    const [error, setError] = useState<string | null>(null);

    const createRoom = async () => {
        setLoading(true);
        setError(null);
        try {
            const botWaitMs = parseInt(botInterval) * 1000;
            const durationSeconds = parseInt(duration);

            if (isNaN(botWaitMs) || botWaitMs < 0) {
                setError("El intervalo de bots debe ser un número válido >= 0.");
                setLoading(false);
                return;
            }
            if (isNaN(durationSeconds) || durationSeconds < 10) {
                setError("La duración debe ser al menos 10 segundos.");
                setLoading(false);
                return;
            }

            const payload: any = { priceCents: price, gameType: type, botWaitMs, durationSeconds };
            if (type === "DICE_DUEL") payload.capacity = 2;

            const r = await fetch("/api/rooms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await r.json().catch(() => ({}));

            if (!r.ok) {
                setError(d.error || `Error ${r.status}: No se pudo crear la sala.`);
                return;
            }

            // Success
            setShowModal(false);
            setBotInterval("0"); // Reset
            alert("Sala creada exitosamente"); // Still alert for success? Or just auto-close. User might prefer notification. 
            // Stick to alert for verify for now, or just close. Let's just close.

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="btn btn-primary btn-sm whitespace-nowrap"
            >
                {label}
            </button>

            {/* Galaxy Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />

                    {/* Card */}
                    <div className="relative bg-[#0f172a] border border-[#10b981]/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(16,185,129,0.15)] w-full max-w-sm">
                        <h3 className="text-xl font-bold text-white mb-1">Configurar {type === "ROULETTE" ? "Ruleta" : "Dados"}</h3>
                        <p className="text-white/50 text-xs mb-6 uppercase tracking-wider">Crear nueva sala</p>

                        <div className="space-y-4 mb-6">
                            {/* Input Duration */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Duración de Partida (segundos)
                                </label>
                                <input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    min="10"
                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-all"
                                    placeholder="Ej: 40"
                                />
                                <p className="text-xs text-white/40 mt-1">
                                    Tiempo que la sala permanece abierta recibiendo jugadores.
                                </p>
                            </div>

                            {/* Input Bot Wait */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">
                                    Tiempo de Relleno (segundos)
                                </label>
                                <input
                                    type="number"
                                    value={botInterval}
                                    onChange={(e) => setBotInterval(e.target.value)}
                                    min="0"
                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-all"
                                    placeholder="0 para desactivar"
                                />
                                <p className="text-xs text-white/40 mt-1">
                                    Tiempo EXTRA después del cierre para que los bots entren.
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-200 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 rounded-lg font-medium text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={createRoom}
                                disabled={loading}
                                className="px-6 py-2 rounded-lg font-bold text-sm text-[#0f172a] bg-[#10b981] hover:bg-[#059669] shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Creando..." : "Crear Sala"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

