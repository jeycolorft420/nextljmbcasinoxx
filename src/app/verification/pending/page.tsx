
"use client";

import Link from "next/link";

export default function VerificationPendingPage() {
    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1B2735] via-[#090A0F] to-[#090A0F] text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg bg-black/40 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/10 ring-1 ring-white/5 text-center">

                <div className="w-24 h-24 bg-yellow-500/10 text-yellow-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20 shadow-[0_0_30px_-10px_rgba(234,179,8,0.3)]">
                    <span className="text-5xl">⏳</span>
                </div>

                <h1 className="text-3xl font-extrabold mb-4 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Verificación Pendiente
                </h1>

                <p className="text-slate-400 mb-8 leading-relaxed">
                    Hemos recibido tus documentos correctamente. Nuestro equipo revisará tu identidad en breve.
                    <br /><br />
                    Recibirás una notificación cuando tu cuenta sea aprobada y desbloqueada.
                </p>

                <div className="flex flex-col gap-3">
                    <Link
                        href="/"
                        className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-xl border border-white/10 transition-all"
                    >
                        Volver al Inicio
                    </Link>
                    <Link
                        href="/support"
                        className="text-sm text-slate-500 hover:text-slate-400 underline"
                    >
                        ¿Tienes dudas? Contacta a soporte
                    </Link>
                </div>

            </div>
        </div>
    );
}

