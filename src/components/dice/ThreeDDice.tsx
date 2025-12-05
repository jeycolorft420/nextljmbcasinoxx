import React from "react";
import "./ThreeDDice.css";

export type DiceSkin = "white" | "red" | "blue" | "green" | "purple" | "yellow" | "dark";

interface Props {
    face: number | null; // 1-6, or null for unknown
    rolling: boolean;
    skin?: DiceSkin;
    size?: number; // px (default 80)
}

export function ThreeDDice({ face, rolling, skin = "white", size = 80, variant = 1 }: Props & { variant?: number }) {
    // Map skin to CSS class
    const skinClass = skin === "white" ? "" : `skin-${skin}`;

    // Calculate transform for size (base 80px)
    const scale = size / 80;

    // Pips layout helper
    const renderContent = (n: number) => {
        // Only show ? if we are NOT rolling and have no result
        if (face === null && !rolling) {
            return <div className="text-3xl font-bold text-white/90 drop-shadow-md">?</div>;
        }

        const pips = [];
        // Standard dice layouts
        const layouts: Record<number, number[]> = {
            1: [5],
            2: [1, 9],
            3: [1, 5, 9],
            4: [1, 3, 7, 9],
            5: [1, 3, 5, 7, 9],
            6: [1, 3, 4, 6, 7, 9]
        };
        const active = new Set(layouts[n] || []);
        for (let i = 1; i <= 9; i++) {
            pips.push(<div key={i} className={active.has(i) ? "pip" : ""} />);
        }
        return <div className="pip-grid">{pips}</div>;
    };

    // If unknown, show face 1 (front)
    const targetFace = face || 1;

    // Variant classes for different rotation axes
    // We assume CSS has .rolling, .rolling-v2, .rolling-v3, etc.
    // If not, we can use inline styles for animation-name if defined, or just rely on CSS changes later.
    // For now, let's append the variant to the class name if > 1.
    const rollingClass = rolling ? (variant > 1 ? `rolling-v${variant}` : "rolling") : `show-${targetFace}`;

    return (
        <div className="scene" style={{ width: size, height: size }}>
            <div style={{
                width: 80,
                height: 80,
                transform: `scale(${scale})`,
                transformOrigin: "top left"
            }}>
                <div className={`cube ${rollingClass} ${skinClass}`}>
                    {[1, 2, 3, 4, 5, 6].map((f) => (
                        <div key={f} className={`cube__face face--${f}`}>
                            {renderContent(f)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
