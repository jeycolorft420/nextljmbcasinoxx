"use client";

import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";

export default function TwoFactorSetup({ enabled, onEnabled }: { enabled?: boolean; onEnabled?: () => void }) {
    const [step, setStep] = useState<"idle" | "qr" | "success">(enabled ? "success" : "idle");
    const [qrCode, setQrCode] = useState("");
    const [token, setToken] = useState("");
    const [loading, setLoading] = useState(false);

    const startSetup = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                setQrCode(data.qrImageUrl);
                setStep("qr");
            } else {
                toast.error(data.error || "Error iniciando setup");
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const verify = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch("/api/auth/2fa/setup", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const data = await res.json();
            if (res.ok) {
                setStep("success");
                toast.success("¡2FA Activado correctamente!");
                if (onEnabled) onEnabled();
            } else {
                toast.error(data.error || "Código inválido");
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    if (step === "success") {
        return (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
                <div className="flex items-center gap-2 font-bold mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
                    2FA Activado
                </div>
                <p className="text-sm opacity-80">Tu cuenta está protegida con autenticación de dos factores.</p>
            </div>
        );
    }

    if (step === "qr") {
        return (
            <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
                <h3 className="font-bold text-lg">Escanear Código QR</h3>
                <p className="text-sm opacity-70">
                    Abre Google Authenticator (o tu app favorita) y escanea este código:
                </p>

                <div className="bg-white p-4 rounded-lg w-fit mx-auto">
                    {qrCode && <Image src={qrCode} alt="QR Code" width={180} height={180} unoptimized />}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Ingresa el código de 6 dígitos:</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={token}
                            onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                            className="input input-bordered w-full text-center tracking-widest font-mono text-lg"
                        />
                        <button
                            onClick={verify}
                            disabled={loading || token.length !== 6}
                            className="btn btn-primary"
                        >
                            {loading ? "..." : "Verificar"}
                        </button>
                    </div>
                </div>

                <button onClick={() => setStep("idle")} className="text-xs opacity-50 hover:opacity-100 underline">
                    Cancelar
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
            <div>
                <div className="font-bold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Autenticación de Dos Factores (2FA)
                </div>
                <p className="text-sm opacity-60 mt-1">Añade una capa extra de seguridad a tu cuenta.</p>
            </div>
            <button onClick={startSetup} disabled={loading} className="btn btn-outline btn-sm">
                {loading ? "..." : "Activar"}
            </button>
        </div>
    );
}
