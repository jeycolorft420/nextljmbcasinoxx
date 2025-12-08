import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    currentSkin: string;
    ownedSkins: string[];
    balanceCents: number;
    onSelect: (skin: string) => void;
};

// Colors matching API (english keys)
const DICE_COLORS = ["white", "red", "blue", "green", "purple", "yellow", "pink", "dark"];

const TRANSLATIONS: Record<string, string> = {
    "white": "BLANCO",
    "red": "ROJO",
    "blue": "AZUL",
    "green": "VERDE",
    "purple": "MORADO",
    "yellow": "AMARILLO",
    "pink": "ROSADO",
    "dark": "NEGRO",
};

const COLOR_MAP: Record<string, string> = {
    "white": "bg-gray-200 border-gray-400",
    "red": "bg-red-500 border-red-700",
    "blue": "bg-blue-500 border-blue-700",
    "green": "bg-emerald-500 border-emerald-700",
    "purple": "bg-purple-500 border-purple-700",
    "yellow": "bg-yellow-400 border-yellow-600",
    "pink": "bg-pink-500 border-pink-700",
    "dark": "bg-gray-800 border-black",
};

const PRICES: Record<string, number> = {
    "white": 0,
    "dark": 100,
    "red": 100,
    "blue": 100,
    "green": 100,
    "purple": 100,
    "yellow": 200,
    "pink": 200,
};

export default function DiceSkinSelector({ isOpen, onClose, currentSkin, ownedSkins, balanceCents, onSelect }: Props) {
    const router = useRouter();
    const [buying, setBuying] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleBuy = async (color: string) => {
        if (buying) return;
        setBuying(color);
        try {
            const res = await fetch("/api/shop/buy-skin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ color })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`¡Comprado! ${TRANSLATIONS[color]}`);
                // Optimistic select
                onSelect(color);
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
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-white/60">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>

                <h3 className="text-xl font-bold text-white mb-2 text-center">Color de Dados</h3>
                <div className="text-center text-xs text-gray-400 mb-6 font-mono">
                    Saldo: ${(balanceCents / 100).toFixed(2)}
                </div>

                <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
                    {DICE_COLORS.map((color) => {
                        const isSelected = (currentSkin || "white") === color;
                        const isOwned = ownedSkins.includes(color) || color === "white";
                        const price = PRICES[color] ?? 100;
                        const canAfford = balanceCents >= price;
                        const isBuying = buying === color;
                        const isConfirming = confirming === color;

                        return (
                            <div key={color} className="flex flex-col gap-1 relative">
                                <button
                                    disabled
                                    className={`
                                        relative group rounded-xl p-4 border-2 transition-all flex flex-col items-center gap-2 w-full cursor-default
                                        ${isSelected ? "border-primary bg-primary/10" :
                                            isOwned ? "border-white/5 bg-white/5" :
                                                "border-white/5 bg-black/40 opacity-70 grayscale"}
                                    `}
                                >
                                    <div className={`w-10 h-10 rounded-lg shadow-lg ${COLOR_MAP[color]}`}></div>
                                    <span className={`text-xs font-bold uppercase ${isSelected ? "text-primary" : "text-gray-400"}`}>
                                        {TRANSLATIONS[color]}
                                    </span>
                                    {!isOwned && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                        </div>
                                    )}
                                </button>

                                {isConfirming ? (
                                    <div className="absolute inset-0 bg-gray-900/95 rounded-xl z-10 flex flex-col items-center justify-center gap-2 p-2 border border-primary/50 animate-in fade-in zoom-in-95 duration-200">
                                        <span className="text-[10px] text-white font-bold text-center leading-tight">¿Usar {TRANSLATIONS[color]}?</span>
                                        <div className="flex gap-1 w-full">
                                            <button onClick={() => { onSelect(color); onClose(); }} className="flex-1 bg-primary hover:bg-primary/90 text-black text-[10px] font-bold py-1 rounded">SI</button>
                                            <button onClick={() => setConfirming(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold py-1 rounded">NO</button>
                                        </div>
                                    </div>
                                ) : isOwned ? (
                                    <button
                                        disabled={isSelected}
                                        onClick={() => setConfirming(color)}
                                        className={`
                                            text-[10px] font-bold py-1 px-2 rounded-lg border w-full transition-colors
                                            ${isSelected
                                                ? "bg-primary/20 border-primary text-primary cursor-default"
                                                : "bg-gray-800 border-gray-600 text-white hover:bg-gray-700 hover:border-gray-500"}
                                        `}
                                    >
                                        {isSelected ? "EN USO" : "USAR"}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleBuy(color)}
                                        disabled={!canAfford || isBuying}
                                        className={`
                                            text-[10px] font-bold py-1 px-2 rounded-lg border w-full transition-colors
                                            ${canAfford
                                                ? "bg-green-600 border-green-500 text-white hover:bg-green-500"
                                                : "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed"}
                                        `}
                                    >
                                        {isBuying ? "..." : `Comprar $${price / 100}`}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
