"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import GameImageEditor from "@/components/admin/GameImageEditor";

type Props = {
    initialDiceCover: string;
    initialRouletteCover: string;
    isAdmin: boolean;
};

export default function GameSelector({ initialDiceCover, initialRouletteCover, isAdmin }: Props) {
    const router = useRouter();
    const { status } = useSession();
    const [diceCover, setDiceCover] = useState(initialDiceCover);
    const [rouletteCover, setRouletteCover] = useState(initialRouletteCover);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingGame, setEditingGame] = useState<"DICE_DUEL" | "ROULETTE">("DICE_DUEL");

    const handleEditCover = (g: "DICE_DUEL" | "ROULETTE", e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingGame(g);
        setEditorOpen(true);
    };

    const handleSaveCover = async (newUrl: string) => {
        if (editingGame === "DICE_DUEL") {
            setDiceCover(newUrl);
        } else {
            setRouletteCover(newUrl);
        }

        // Also update on server to persist (though component state handles immediate feedback)
        try {
            await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    [editingGame === "DICE_DUEL" ? "diceCoverUrl" : "rouletteCoverUrl"]: newUrl
                })
            });
            router.refresh(); // Refresh server components to ensure sync
        } catch (err) {
            console.error("Failed to save setting", err);
        }
    };

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                {/* Dice Card */}
                <div
                    onClick={() => {
                        if (status === "unauthenticated") {
                            router.push("/login");
                        } else {
                            router.push("/rooms/dice");
                        }
                    }}
                    className="relative group overflow-hidden rounded-2xl border-2 border-white/10 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all duration-300 h-64 cursor-pointer"
                >
                    <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                        style={{ backgroundImage: `url('${diceCover}')` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                    {isAdmin && (
                        <div
                            onClick={(e) => handleEditCover("DICE_DUEL", e)}
                            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-primary rounded-full backdrop-blur transition-colors z-10 cursor-pointer"
                            title="Editar portada"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </div>
                    )}

                    <div className="absolute bottom-0 left-0 p-6 text-left w-full">
                        <h3 className="text-3xl font-bold mb-2 text-white group-hover:text-primary transition-colors">
                            Dados
                        </h3>
                        <p className="text-sm text-slate-300 line-clamp-2">
                            Duelo 1vs1. El número más alto gana el pozo.
                        </p>
                    </div>
                </div>

                {/* Roulette Card */}
                <div
                    onClick={() => {
                        if (status === "unauthenticated") {
                            router.push("/login");
                        } else {
                            router.push("/rooms/roulette");
                        }
                    }}
                    className="relative group overflow-hidden rounded-2xl border-2 border-white/10 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all duration-300 h-64 cursor-pointer"
                >
                    <div
                        className="absolute inset-0 bg-cover transition-transform duration-500 group-hover:scale-110"
                        style={{
                            backgroundImage: `url('${rouletteCover}')`,
                            backgroundPosition: "center 65%"
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                    {isAdmin && (
                        <div
                            onClick={(e) => handleEditCover("ROULETTE", e)}
                            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-primary rounded-full backdrop-blur transition-colors z-10 cursor-pointer"
                            title="Editar portada"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </div>
                    )}

                    <div className="absolute bottom-0 left-0 p-6 text-left w-full">
                        <h3 className="text-3xl font-bold mb-2 text-white group-hover:text-primary transition-colors">
                            Ruleta
                        </h3>
                        <p className="text-sm text-slate-300 line-clamp-2">
                            Clásico juego de azar. Apuesta a colores o números.
                        </p>
                    </div>
                </div>
            </div>

            <GameImageEditor
                isOpen={editorOpen}
                onClose={() => setEditorOpen(false)}
                game={editingGame}
                currentUrl={editingGame === "DICE_DUEL" ? diceCover : rouletteCover}
                onSave={handleSaveCover}
            />
        </>
    );
}
