"use client";

import React from "react";

// Eliminamos dependencias de Three.js que causan el crash
export type DiceSkin = "white" | "red" | "blue" | "green" | "yellow" | "purple" | "black";

interface Props {
    face: number | null;
    rolling: boolean;
    skin?: DiceSkin;
    size?: number;
}

const SKIN_COLORS: Record<string, string> = {
    white: "#f8fafc",
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#10b981",
    yellow: "#f59e0b",
    purple: "#8b5cf6",
    black: "#1e293b",
};

// Mapa de puntos para dibujar las caras del dado
const DOTS_MAP: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
};

export const ThreeDDice = ({ face, rolling, skin = "white", size = 100 }: Props) => {
    const depth = size / 2;
    const baseColor = SKIN_COLORS[skin] || SKIN_COLORS.white;
    const isDark = ["black", "blue", "purple", "red"].includes(skin);
    const dotColor = isDark ? "white" : "black";
    const borderColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)";

    // Transformaciones CSS para mostrar la cara correcta
    const getTransform = (val: number) => {
        switch (val) {
            case 1: return 'rotateY(0deg) rotateX(0deg)';
            case 2: return 'rotateY(-90deg) rotateX(0deg)';
            case 3: return 'rotateY(0deg) rotateX(-90deg)'; // Ajustado para estandar
            case 4: return 'rotateY(90deg) rotateX(0deg)';
            case 5: return 'rotateY(0deg) rotateX(90deg)';
            case 6: return 'rotateY(180deg) rotateX(0deg)';
            default: return 'rotateY(0deg)';
        }
    };

    return (
        <div className="dice-scene" style={{ width: size, height: size }}>
            <div
                className={`dice-cube ${rolling ? "is-rolling" : ""}`}
                style={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.5s ease-out',
                    transform: rolling
                        ? `rotateX(${Math.random() * 720}deg) rotateY(${Math.random() * 720}deg)`
                        : getTransform(face || 1)
                }}
            >
                {/* Caras del dado */}
                {[
                    { n: 1, tf: `rotateY(0deg) translateZ(${depth}px)` },
                    { n: 6, tf: `rotateY(180deg) translateZ(${depth}px)` },
                    { n: 2, tf: `rotateY(90deg) translateZ(${depth}px)` },
                    { n: 4, tf: `rotateY(-90deg) translateZ(${depth}px)` },
                    { n: 3, tf: `rotateX(90deg) translateZ(${depth}px)` },
                    { n: 5, tf: `rotateX(-90deg) translateZ(${depth}px)` }
                ].map((side) => (
                    <div
                        key={side.n}
                        style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            background: baseColor,
                            border: `1px solid ${borderColor}`,
                            borderRadius: '12%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            boxShadow: `inset 0 0 10px ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            transform: side.tf,
                            backfaceVisibility: 'hidden'
                        }}
                    >
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gridTemplateRows: 'repeat(3, 1fr)',
                            width: '60%',
                            height: '60%'
                        }}>
                            {[...Array(9)].map((_, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    {DOTS_MAP[side.n]?.includes(i) && (
                                        <div style={{
                                            width: '70%',
                                            height: '70%',
                                            borderRadius: '50%',
                                            backgroundColor: dotColor,
                                            boxShadow: 'inset 0 0 2px rgba(0,0,0,0.5)'
                                        }} />
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
