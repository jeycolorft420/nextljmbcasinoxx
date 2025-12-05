"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

type SoundName = "spin" | "win" | "click" | "error" | "roll";

interface AudioContextType {
    play: (name: SoundName) => void;
    toggleMute: () => void;
    muted: boolean;
}

const AudioContext = createContext<AudioContextType | null>(null);

const SOUND_FILES: Record<SoundName, string> = {
    spin: "/sfx/roulette-spin.mp3",
    win: "/sfx/win.mp3",
    click: "/sfx/click.mp3",
    error: "/sfx/error.mp3",
    roll: "/sfx/dice-roll.mp3", // Assuming we have or will have this
};

export function AudioProvider({ children }: { children: React.ReactNode }) {
    const [muted, setMuted] = useState(false);
    const audioRefs = useRef<Map<SoundName, HTMLAudioElement>>(new Map());
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        // Preload sounds
        Object.entries(SOUND_FILES).forEach(([name, path]) => {
            const audio = new Audio(path);
            audio.preload = "auto";
            audioRefs.current.set(name as SoundName, audio);
        });
        setInitialized(true);
    }, []);

    const play = (name: SoundName) => {
        if (muted || !initialized) return;
        const audio = audioRefs.current.get(name);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch((e) => console.warn("Audio play failed:", e));
        }
    };

    const toggleMute = () => setMuted((prev) => !prev);

    return (
        <AudioContext.Provider value={{ play, toggleMute, muted }}>
            {children}
        </AudioContext.Provider>
    );
}

export function useAudio() {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error("useAudio must be used within an AudioProvider");
    }
    return context;
}
