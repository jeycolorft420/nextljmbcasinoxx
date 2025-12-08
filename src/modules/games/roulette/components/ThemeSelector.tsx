"use client";

import { useState } from "react";
import { toast } from "sonner";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: string;
    ownedSkins: string[]; // List of skin IDs
    balanceCents: number;
    onSelect: (skin: string) => void;
};

// Configuración de Skins (debe coincidir con backend para precios)
const SKINS_CONFIG: Record<string, { name: string; price: number; colorClass: string }> = {
    "default": { name: "Estándar", price: 0, colorClass: "bg-gray-800" },
    "classic": { name: "Clásico (Rojo/Negro)", price: 500, colorClass: "bg-red-600" },
    "vip": { name: "VIP (Oro)", price: 1000, colorClass: "bg-amber-500" },
    "cyberpunk": { name: "Cyberpunk", price: 800, colorClass: "bg-pink-500" },
    "matrix": { name: "Matrix", price: 800, colorClass: "bg-emerald-500" },
    "dark": { name: "Full Dark", price: 500, colorClass: "bg-black border border-white/20" },
    "white": { name: "Blanco Puro", price: 500, colorClass: "bg-white border-2 border-gray-300" },
};

const SKIN_KEYS = Object.keys(SKINS_CONFIG);

export default function ThemeSelector({ isOpen, onClose, currentTheme, ownedSkins, balanceCents, onSelect }: Props) {
    const [buying, setBuying] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleBuy = async (skinId: string) => {
        if (buying) return;
        setBuying(skinId);
        try {
            const res = await fetch("/api/shop/roulette", {
                method: "POST", // POST es compra
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skinId })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`¡Skin Comprado!`);
                onSelect(skinId); // Auto-equip optmistic
                onClose();
            } else {
                toast.error(data.error || "No se pudo comprar");
            }
        } catch {
            toast.error("Error de conexión");
        } finally {
            setBuying(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-white">Personalizar Ruleta</h3>
                        <p className="text-xs text-gray-400 font-mono">Saldo: ${(balanceCents / 100).toFixed(2)}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
                    {SKIN_KEYS.map((skin) => {
                        const conf = SKINS_CONFIG[skin];
                        const isSelected = currentTheme === skin;
                        const isOwned = ownedSkins.includes(skin) || skin === "default";
                        const canAfford = balanceCents >= conf.price;
                        const isBuying = buying === skin;
                        const isConfirming = confirming === skin;

                        return (
                            <div key={skin} className="relative group rounded-xl p-3 border-2 border-white/5 bg-white/5 flex flex-col items-center gap-2">
                                {/* Visual Preview */}
                                <div className={`w-16 h-16 rounded-full shadow-lg ${conf.colorClass} flex items-center justify-center`}>
                                    <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                                </div>

                                <div className="text-center w-full">
                                    <div className="text-xs font-bold text-white truncate">{conf.name}</div>
                                    {!isOwned && <div className="text-[10px] text-gray-400">${conf.price / 100}</div>}
                                </div>

                                {/* Acciones */}
                                <div className="w-full mt-1">
                                    {isConfirming ? (
                                        <div className="absolute inset-0 bg-gray-900/95 rounded-xl z-20 flex flex-col items-center justify-center gap-2 p-2 border border-primary/50 animate-in fade-in zoom-in-95">
                                            <span className="text-[10px] text-white font-bold text-center">¿Usar Skin?</span>
                                            <div className="flex gap-1 w-full">
                                                <button onClick={() => { onSelect(skin); onClose(); }} className="flex-1 bg-primary text-black text-[10px] font-bold py-1 rounded">SI</button>
                                                <button onClick={() => setConfirming(null)} className="flex-1 bg-white/10 text-white text-[10px] font-bold py-1 rounded">NO</button>
                                            </div>
                                        </div>
                                    ) : isOwned ? (
                                        <button
                                            disabled={isSelected}
                                            onClick={() => setConfirming(skin)}
                                            className={`
                                                w-full text-[10px] font-bold py-1.5 px-2 rounded-lg border transition-colors
                                                ${isSelected
                                                    ? "bg-primary/20 border-primary text-primary cursor-default"
                                                    : "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"}
                                            `}
                                        >
                                            {isSelected ? "EQUIPADO" : "USAR"}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleBuy(skin)}
                                            disabled={!canAfford || isBuying}
                                            className={`
                                                w-full text-[10px] font-bold py-1.5 px-2 rounded-lg border transition-colors
                                                ${canAfford
                                                    ? "bg-green-600 border-green-500 text-white hover:bg-green-500"
                                                    : "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed"}
                                            `}
                                        >
                                            {isBuying ? "..." : `COMPRAR $${conf.price / 100}`}
                                        </button>
                                    )}
                                </div>

                                {/* Lock Overlay for unowned */}
                                {!isOwned && !isConfirming && (
                                    <div className="absolute top-2 right-2 opacity-50">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
