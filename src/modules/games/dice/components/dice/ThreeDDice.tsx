"use client";

import React from "react";
import "./ThreeDDice.css";

export type DiceSkin = "white" | "red" | "blue" | "green" | "yellow" | "purple" | "black";

interface Props {
    face: number | null;
    rolling: boolean;
    skin?: DiceSkin;
    size?: number;
}

const SKIN_COLORS: Record<string, string> = {
    white: "#f8fafc", red: "#ef4444", blue: "#3b82f6", green: "#10b981",
    yellow: "#f59e0b", purple: "#8b5cf6", black: "#1e293b",
};

const DOTS_MAP: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export const ThreeDDice = ({ face, rolling, skin = "white", size = 100 }: Props) => {
    // 1. Calcular profundidad (Radio del cubo)
    const depth = size / 2;

    // 2. Colores
    const baseColor = SKIN_COLORS[skin] || SKIN_COLORS.white;
    const isDark = ["black", "blue", "purple", "red"].includes(skin);
    const dotColor = isDark ? "white" : "black";

    // 3. Rotación Estática (Cuando para)
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

    return (
        <div className="scene" style={{ width: size, height: size }}>
            <div
                className={`cube ${rolling ? "is-rolling" : ""}`}
                style={{
                    // Variables CSS para el tamaño
                    ['--depth' as any]: `${depth}px`,
                    ['--base-color' as any]: baseColor,
                    // Si rueda, CSS manda. Si para, React manda.
                    transform: rolling ? undefined : getTransform(face || 1)
                }}
            >
                <div className="cube__inner" style={{ transform: `translateZ(-2px)` }}></div>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className={`cube__face cube__face--${n}`}>
                        {/* Grid 3x3 para los puntos */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '60%', height: '60%' }}>
                            {[...Array(9)].map((_, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    {DOTS_MAP[n]?.includes(i) && (
                                        <div style={{ width: '80%', height: '80%', borderRadius: '50%', backgroundColor: dotColor }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
