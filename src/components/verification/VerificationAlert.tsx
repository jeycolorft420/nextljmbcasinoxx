
"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function VerificationAlert() {
    const { data: session, update } = useSession();
    const pathname = usePathname();

    // Auto-refresh session on mount to check for status updates
    useEffect(() => {
        if (session?.user && session.user.verificationStatus !== "APPROVED") {
            update();
        }
    }, []); // Run once on mount

    if (!session?.user) return null;

    // Si ya estamos en /verification, no molestar tanto
    if (pathname.startsWith("/verification")) return null;

    // @ts-ignore
    const status = session.user.verificationStatus;

    if (status === "APPROVED") return null;

    if (status === "PENDING") {
        return (
            <div className="bg-yellow-500/10 border-b border-yellow-500/20 py-2 px-4 text-center flex justify-between items-center">
                <p className="text-yellow-400 text-sm">
                    ⏳ Tu verificación está <strong>pendiente de revisión</strong>.
                </p>
                <button onClick={() => update()} className="text-xs underline text-yellow-500 hover:text-yellow-400">
                    Actualizar estado
                </button>
            </div>
        );
    }

    // UNVERIFIED or REJECTED
    return (
        <div className="bg-red-600 py-3 px-4 text-center animate-pulse relative">
            <div className="container mx-auto flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4">
                <span className="text-white font-bold text-sm md:text-base">
                    🚨 ¡Acción Requerida! Debes verificar tu identidad para poder jugar y depositar.
                </span>
                <Link
                    href="/verification"
                    className="btn btn-sm btn-white text-red-600 font-bold hover:bg-gray-100 border-none"
                >
                    Verificar Ahora ➔
                </Link>
            </div>
            <button
                onClick={() => update()}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/50 hover:text-white underline"
            >
                ¿Ya lo hiciste?
            </button>
            <div className="text-[10px] text-white/40 mt-1 font-mono text-center">
                DEBUG: st="{status}" | role="{(session.user as any).role}" | email="{session.user.email}"
            </div>
        </div>
    );
}
