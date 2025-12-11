"use client";

import React from "react";
import "./ThreeDDice.css";

export type DiceSkin = "white" | "red" | "blue" | "green" | "yellow" | "purple" | "black";

interface Props {
    face: number | null;
    rolling: boolean;
    skin?: DiceSkin;
    size?: number;
    variant?: 1 | 2;
}

// Mapa de colores brillantes tipo "Neon/Casino"
const SKIN_COLORS: Record<string, string> = {
    white: "#f8fafc",
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#10b981",
    yellow: "#f59e0b",
    purple: "#8b5cf6",
    black: "#1e293b",
};

// Puntos de los dados (Posiciones CSS Grid)
const DOTS_MAP: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
};

export const ThreeDDice = ({ face, rolling, skin = "white", size = 100 }: Props) => {
    const style = {
        width: size,
        height: size,
        "--depth": `${size / 2}px`,
    } as React.CSSProperties;

    const baseColor = SKIN_COLORS[skin] || SKIN_COLORS.white;
    const isDarkSkin = skin === "black" || skin === "blue" || skin === "purple" || skin === "red";
    const dotColor = isDarkSkin ? "white" : "black";

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
                className={`cube ${rolling ? "is-rolling" : ""}`}
                style={{ ...style, transform: rolling ? undefined : transform }}
            >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                        key={n}
                        className={`cube__face cube__face--${n}`}
                        style={{
                            backgroundColor: baseColor,
                            border: `1px solid ${isDarkSkin ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                            boxShadow: `inset 0 0 15px ${isDarkSkin ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.05)'}`
                        }}
                    >
                        {/* Renderizar Puntos */}
                        <div className="w-full h-full grid grid-cols-3 grid-rows-3 p-[15%]">
                            {[...Array(9)].map((_, i) => (
                                <div key={i} className="flex justify-center items-center">
                                    {DOTS_MAP[n]?.includes(i) && (
                                        <div
                                            className="rounded-full shadow-sm"
                                            style={{
                                                width: '80%',
                                                height: '80%',
                                                backgroundColor: dotColor,
                                                boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.3)'
                                            }}
                                        />
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
