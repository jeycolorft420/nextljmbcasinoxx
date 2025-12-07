"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function UsernameModal() {
    const { data: session, update } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [username, setUsername] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (session?.user && !(session.user as any).username) {
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    }, [session]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/me/username", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username })
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || "Error al guardar");
                return;
            }

            toast.success(`¡Bienvenido, @${data.username}!`);
            await update(); // Refresh session to confirm username is set
            setIsOpen(false);
            router.refresh();

        } catch (error) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <div className="bg-[#131b2e] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-600" />

                <h2 className="text-2xl font-bold text-center mb-2">¡Crea tu Identidad! 🚀</h2>
                <p className="text-center text-slate-400 text-sm mb-6">
                    Para comenzar a jugar, necesitas un <strong>nombre de usuario único</strong>.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-xs uppercase font-bold text-slate-500 ml-1">Tu Usuario</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">@</span>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                                placeholder="usuario123"
                                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-lg"
                                maxLength={15}
                                autoFocus
                            />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 text-right">
                            Solo minúsculas y números (Máx 15)
                        </p>
                    </div>

                    <button
                        disabled={loading || username.length < 3}
                        className="btn btn-primary w-full shadow-lg shadow-primary/20 text-lg font-bold"
                    >
                        {loading ? <span className="loading loading-spinner loading-sm"></span> : "Confirmar y Jugar 🎮"}
                    </button>

                    <p className="text-[10px] text-center text-slate-600">
                        No podrás cambiar esto después. Elige sabiamente.
                    </p>
                </form>
            </div>
        </div>
    );
}
