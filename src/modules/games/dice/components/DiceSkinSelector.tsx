"use client";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    currentSkin: string;
    onSelect: (skin: string) => void;
};

// Dice Colors available (matching ThreeDDice.tsx)
const DICE_COLORS = ["white", "red", "blue", "green", "purple", "yellow", "dark"];

const COLOR_MAP: Record<string, string> = {
    "white": "bg-gray-200 border-gray-400",
    "red": "bg-red-500 border-red-700",
    "blue": "bg-blue-500 border-blue-700",
    "green": "bg-emerald-500 border-emerald-700",
    "purple": "bg-purple-500 border-purple-700",
    "yellow": "bg-yellow-400 border-yellow-600",
    "dark": "bg-gray-800 border-black",
};

export default function DiceSkinSelector({ isOpen, onClose, currentSkin, onSelect }: Props) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors text-white/60">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>

                <h3 className="text-xl font-bold text-white mb-6 text-center">Color de Dados</h3>

                <div className="grid grid-cols-3 gap-4">
                    {DICE_COLORS.map((color) => {
                        const isSelected = (currentSkin || "white") === color;
                        return (
                            <button
                                key={color}
                                onClick={() => { onSelect(color); onClose(); }}
                                className={`
                                    relative group rounded-xl p-4 border-2 transition-all active:scale-95 flex flex-col items-center gap-2
                                    ${isSelected ? "border-primary bg-primary/10" : "border-white/5 bg-white/5 hover:border-white/20"}
                                `}
                            >
                                <div className={`w-10 h-10 rounded-lg shadow-lg ${COLOR_MAP[color]}`}></div>
                                <span className={`text-xs font-bold uppercase ${isSelected ? "text-primary" : "text-gray-400"}`}>
                                    {color}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
