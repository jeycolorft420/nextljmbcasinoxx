"use client";

import { useMemo } from "react";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: string;
    ownedSkins: string[]; // List of skin IDs/names the user owns
    onSelect: (skin: string) => void;
};

// Map of skin keys to human readable names or colors
const THEME_Colors: Record<string, string> = {
    "default": "bg-gray-800",
    "classic": "bg-red-600",
    "vip": "bg-amber-500",
    "cyberpunk": "bg-pink-500",
    "matrix": "bg-green-500",
};

export default function ThemeSelector({ isOpen, onClose, currentTheme, ownedSkins, onSelect }: Props) {
    if (!isOpen) return null;

    // Ensure default is always available
    const available = Array.from(new Set([...ownedSkins, "default"]));

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">Elige tu Estilo</h3>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
                    {available.map((skin) => {
                        const isSelected = currentTheme === skin;
                        return (
                            <button
                                key={skin}
                                onClick={() => { onSelect(skin); onClose(); }}
                                className={`relative group rounded-xl p-3 border-2 transition-all active:scale-95 flex flex-col items-center gap-2
                  ${isSelected ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.3)]" : "border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10"}
                `}
                            >
                                {/* Visual Preview Circle */}
                                <div className={`w-12 h-12 rounded-full shadow-lg ${THEME_Colors[skin] || "bg-gray-500"} border-2 border-white/20 group-hover:scale-110 transition-transform`}></div>

                                <span className={`text-xs font-bold uppercase ${isSelected ? "text-primary" : "text-gray-400 group-hover:text-white"}`}>
                                    {skin}
                                </span>

                                {isSelected && (
                                    <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_5px_lime]"></div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
