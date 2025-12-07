"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AdminLockScreen() {
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const unlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/admin/unlock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            });

            if (res.ok) {
                toast.success("Acceso concedido");
                window.location.reload(); // Force full reload to ensure cookie is sent
            } else {
                const d = await res.json();
                toast.error(d.error || "Código incorrecto");
            }
        } catch (err) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-card border border-white/10 rounded-2xl p-8 shadow-2xl text-center space-y-6">
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-primary transition"
                autoFocus
                />

                <button
                    disabled={loading || code.length !== 6}
                    className="btn btn-primary w-full py-3 font-bold text-lg shadow-lg shadow-primary/20"
                >
                    {loading ? "Verificando..." : "Desbloquear"}
                </button>
            </form>

            <div className="text-xs opacity-40">
                Si no tienes acceso, contacta al administrador principal.
            </div>
        </div>
        </div >
    );
}
