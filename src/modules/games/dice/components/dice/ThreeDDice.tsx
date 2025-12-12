"use client";

import React from "react";
// CSS removed
import { Canvas } from "@react-three/fiber";
import { useGLTF, Float, Stage, PresentationControls } from "@react-three/drei";
import { useEffect, useState, useRef } from "react";
import * as THREE from "three";

// Preload de modelos para que no haya flash blanco
useGLTF.preload("/models/dice-white.glb");
useGLTF.preload("/models/dice-red.glb");
useGLTF.preload("/models/dice-black.glb");
useGLTF.preload("/models/dice-gold.glb");
useGLTF.preload("/models/dice-blue.glb");

type Props = {
    face: number;
    rolling: boolean;
    skin?: string;    // "white" | "red" | "black" | "gold" | "blue"
    size?: number;    // Para ajustar el tamaño del canvas
};

// Mapa de rotaciones para cada cara (ajustar según el modelo 3D exacto)
const FACE_ROTATIONS: Record<number, [number, number, number]> = {
    1: [0, 0, 0],            // Cara 1
    2: [0, 0, -Math.PI / 2], // Cara 2
    3: [0, -Math.PI / 2, 0], // Cara 3
    4: [0, Math.PI / 2, 0],  // Cara 4
    5: [0, 0, Math.PI / 2],  // Cara 5
    6: [Math.PI, 0, 0],      // Cara 6 (o [0, Math.PI, 0])
};

// Mapa de modelos
const SKIN_MODELS: Record<string, string> = {
    white: "/models/dice-white.glb",
    red: "/models/dice-red.glb",
    black: "/models/dice-black.glb",
    gold: "/models/dice-gold.glb",
    blue: "/models/dice-blue.glb",
};

export const ThreeDDice = ({ face, rolling, skin = "white", size = 100 }: Props) => {
    return (
        <div style={{ width: size, height: size }} className="relative">
            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 4], fov: 45 }}>
                <PresentationControls
                    speed={1.5}
                    global
                    zoom={0.7}
                    polar={[-0.1, Math.PI / 4]}
                >
                    <Stage environment="city" intensity={0.6} contactShadow={false}>
                        <DiceModel face={face} rolling={rolling} skin={skin} />
                    </Stage>
                </PresentationControls>
            </Canvas>
        </div>
    );
};

const DiceModel = ({ face, rolling, skin }: { face: number; rolling: boolean; skin: string }) => {
    const modelPath = SKIN_MODELS[skin] || SKIN_MODELS["white"];
    const { scene } = useGLTF(modelPath);
    const meshRef = useRef<THREE.Group>(null);
    const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);

    // Clonar la escena para evitar que se comparta si hay múltiples dados
    const clonedScene = React.useMemo(() => scene.clone(), [scene]);

    useEffect(() => {
        if (rolling) {
            // Rotación loca
            const interval = setInterval(() => {
                setRotation([
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                ]);
            }, 50);
            return () => clearInterval(interval);
        } else {
            // Ir a la cara final
            const target = FACE_ROTATIONS[face] || [0, 0, 0];
            setRotation(target);
        }
    }, [rolling, face]);

    // Interpolar rotación suave
    useEffect(() => {
        if (meshRef.current) {
            // En un frame real usaríamos useFrame con lerp, pero aquí simplificamos
            meshRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
        }
    }, [rotation]);

    // Animar "bamboleo" si está rodando
    // useFrame((state) => {
    //   if (rolling && meshRef.current) {
    //      meshRef.current.rotation.x += 0.2;
    //      meshRef.current.rotation.y += 0.3;
    //   }
    // });

    return <primitive object={clonedScene} ref={meshRef} />;
};
