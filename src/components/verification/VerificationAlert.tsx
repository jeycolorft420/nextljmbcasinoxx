
"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function VerificationAlert() {
    const { data: session } = useSession();
    const pathname = usePathname();

    if (!session?.user) return null;

    // Si ya estamos en /verification, no molestar tanto (o quizás sí para guiar pasos)
    if (pathname.startsWith("/verification")) return null;

    // @ts-ignore - verificationStatus existe en nuestra versión extendida
    const status = session.user.verificationStatus;

    if (status === "APPROVED") return null;

    if (status === "PENDING") {
        return (
            <div className="bg-yellow-500/10 border-b border-yellow-500/20 py-2 px-4 text-center">
                <p className="text-yellow-400 text-sm">
                    ⏳ Tu verificación está <strong>pendidiente de revisión</strong>. Pronto podrás jugar.
                </p>
            </div>
        );
    }

    // UNVERIFIED or REJECTED
    return (
        <div className="bg-red-600 py-3 px-4 text-center animate-pulse">
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
        </div>
    );
}
