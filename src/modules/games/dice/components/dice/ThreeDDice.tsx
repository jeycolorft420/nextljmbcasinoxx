import React from "react";
import "./ThreeDDice.css";

export type DiceSkin = "white" | "red" | "blue" | "green" | "purple" | "yellow" | "dark";

interface Props {
    face: number | null; // 1-6, or null for unknown
    rolling: boolean;
    skin?: DiceSkin;
    size?: number; // px (default 80)
    variant?: number;
}

export function ThreeDDice({ face, rolling, skin = "white", size = 80, variant = 1 }: Props) {
    // Map skin to CSS class if needed (though we might rely on default 'white' + pips or specific skin logic)
    // Existing logic used .skin-color class, we'll keep that but applied to the cube or faces.
    const skinClass = skin === "white" ? "" : `skin-${skin}`;

    // Calculate dynamic style for depth
    const style = {
        width: size,
        height: size,
        "--depth": `${size / 2}px`
    } as React.CSSProperties;

    // Helper to render content (Pips)
    const renderContent = (n: number) => {
        // Unknown state (and NOT rolling) -> show ?
        if (face === null && !rolling && n === 1) {
            return <div className="flex items-center justify-center w-full h-full text-3xl font-bold text-black/20">?</div>;
        }

        const pips = [];
        const layouts: Record<number, number[]> = {
            1: [5],
            2: [1, 9],
            3: [1, 5, 9],
            4: [1, 3, 7, 9],
            5: [1, 3, 5, 7, 9],
            6: [1, 3, 4, 6, 7, 9]
        };
        const active = new Set(layouts[n] || []);

        // Render 9-grid pips
        // We reuse existing .pip/.pip-grid classes or inline them if they were in CSS we overwrote.
        // Since we overwrote CSS, we need to ensure pips render correctly.
        // Let's use simple flex/grid styles here to be safe and self-contained.
        return (
            <div className="w-full h-full grid grid-cols-3 grid-rows-3 p-[15%] gap-0.5">
                {Array.from({ length: 9 }).map((_, i) => {
                    const pipIndex = i + 1;
                    return (
                        <div key={pipIndex} className="flex items-center justify-center">
                            {active.has(pipIndex) && (
                                <div className={`w-full h-full rounded-full ${skin === 'dark' ? 'bg-white' : 'bg-black'} shadow-sm`} />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Rotation Map
    const getTransform = (val: number) => {
        switch (val) {
            case 1: return 'rotateY(0deg)';
            case 2: return 'rotateY(-90deg)';
            case 3: return 'rotateY(180deg)';
            case 4: return 'rotateY(90deg)';
            case 5: return 'rotateX(-90deg)';
            case 6: return 'rotateX(90deg)';
            default: return 'rotateY(0deg)';
        }
    };

    const transform = rolling ? undefined : getTransform(face || 1);

    return (
        <div className="scene" style={{ width: size, height: size }}>
            <div
                className={`cube ${rolling ? "is-rolling" : ""} ${skinClass}`}
                style={{ ...style, transform }}
            >
                {[1, 2, 3, 4, 5, 6].map((f) => (
                    <div key={f} className={`cube__face cube__face--${f} ${skin !== 'white' ? `bg-${skin}-100` : 'bg-white'}`}>
                        {/* Render Pips (or Images if we had them) */}
                        {renderContent(f)}
                    </div>
                ))}
            </div>
        </div>
    );
}
