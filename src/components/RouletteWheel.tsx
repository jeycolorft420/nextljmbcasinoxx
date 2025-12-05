"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Segment = {
  label: string;
  muted?: boolean;
  isYou?: boolean;
  isWinner?: boolean;
};

type Props = {
  segments: Segment[];
  targetIndex?: number | null;
  spinKey?: string | number;
  onSpinEnd?: () => void;
  size?: number;
  spinDurationMs?: number;
  soundUrl?: string;
  theme?: string;
};

const THEMES: Record<string, string[]> = {
  "default": ["#1f2937", "#111827", "#1f2937", "#111827", "#1f2937", "#111827", "#1f2937", "#111827"],
  "classic": ["#ef4444", "#000000", "#ef4444", "#000000", "#ef4444", "#000000", "#ef4444", "#000000"],
  "vip": ["#eab308", "#000000", "#eab308", "#000000", "#eab308", "#000000", "#eab308", "#000000"],
  "cyberpunk": ["#ec4899", "#3b82f6", "#ec4899", "#3b82f6", "#ec4899", "#3b82f6", "#ec4899", "#3b82f6"],
  "matrix": ["#22c55e", "#000000", "#22c55e", "#000000", "#22c55e", "#000000", "#22c55e", "#000000"],
};

export default function RouletteWheel({
  segments,
  targetIndex = null,
  spinKey,
  onSpinEnd,
  size = 360,
  spinDurationMs = 8000,
  soundUrl,
  theme = "default",
}: Props) {
  const n = segments.length || 12;
  const degPer = 360 / n;
  const radius = size / 2;

  const palette = THEMES[theme] || THEMES["default"];

  const [rotation, setRotation] = useState(0);
  const baseRotRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);

  // --- Audio ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);

  useEffect(() => {
    if (!soundUrl) {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch { }
        audioRef.current = null;
      }
      setAudioDurationSec(null);
      return;
    }

    const a = new Audio(soundUrl);
    a.preload = "auto";
    const onMeta = () => {
      if (isFinite(a.duration) && a.duration > 0) setAudioDurationSec(a.duration);
    };
    a.addEventListener("loadedmetadata", onMeta);
    audioRef.current = a;

    // Desbloqueo en primer gesto
    const unlock = async () => {
      if (!audioRef.current || unlockedRef.current) return;
      try {
        audioRef.current.volume = 0;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1;
        unlockedRef.current = true;
      } catch { }
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });

    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      try { a.pause(); } catch { }
      audioRef.current = null;
    };
  }, [soundUrl]);

  const bg = useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const start = i * degPer;
      const end = (i + 1) * degPer;
      const color = palette[i % palette.length];
      parts.push(`${color} ${start}deg ${end}deg`);
    }
    return `conic-gradient(${parts.join(",")})`;
  }, [n, degPer, palette]);

  const labels = useMemo(() => {
    return Array.from({ length: n }).map((_, i) => {
      const angle = (i + 0.5) * degPer;
      return { angle, i };
    });
  }, [n, degPer]);

  // Giro + sincronía con audio
  useEffect(() => {
    console.log("🎡 RouletteWheel Effect Triggered:", { targetIndex, spinKey, currentRot: baseRotRef.current });

    if (targetIndex == null) {
      console.log("🎡 Skipping spin: targetIndex is null");
      return;
    }

    const sectors = segments.length || 12;
    const localDegPer = 360 / sectors;

    // Centro del segmento ganador (en grados relativos al inicio del seg 0)
    const segmentCenterDeg = targetIndex * localDegPer + localDegPer / 2;

    // Queremos que ese centro quede en 0 (Top Pointer).
    // Rotación necesaria R: segmentCenterDeg + R = 0 (mod 360) => R = -segmentCenterDeg
    // Normalizamos target a 0-360
    const desiredRotation = (360 - segmentCenterDeg) % 360;

    // Rotación actual normalizada
    const currentRotation = (baseRotRef.current % 360 + 360) % 360;

    // Calcular delta para llegar al target girando siempre a la derecha (positivo)
    let delta = desiredRotation - currentRotation;
    if (delta < 0) delta += 360;

    const FULL_TURNS = 80; // Giros de emoción
    const target = baseRotRef.current + delta + (FULL_TURNS * 360);

    const el = wheelRef.current;
    if (!el) return;

    const effectiveMs = Math.max(
      300,
      Math.round((audioDurationSec ?? spinDurationMs / 1000) * 1000)
    );

    // Preparar
    el.style.transition = "none";
    el.style.transform = `rotate(${baseRotRef.current}deg)`;

    // Reproducir audio si hay
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => { });
      } catch { }
    }

    // Lanzar animación
    requestAnimationFrame(() => {
      el.style.transition = `transform ${effectiveMs}ms cubic-bezier(0.17, 0.67, 0.16, 1)`;
      setRotation(target);
    });

    const id = setTimeout(() => {
      baseRotRef.current = target;
      if (el) el.style.transition = "";

      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch { }
      }

      onSpinEnd?.();
    }, effectiveMs + 30);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, targetIndex, segments.length, audioDurationSec, spinDurationMs]);

  return (
    <div style={{ width: size, height: size }} className="relative mx-auto select-none">
      {/* Sombra base externa para dar profundidad al plato */}
      <div className="absolute top-2 left-2 right-2 bottom-2 rounded-full shadow-[0_0_60px_rgba(0,0,0,0.8)]" />

      {/* Puntero (Estático, encima de todo) */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-30 filter drop-shadow-md">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M20 38L10 20C9.5 19 10 18 11 18H29C30 18 30.5 19 30 20L20 38Z" fill="#fbbf24" stroke="#78350f" strokeWidth="2" />
          <path d="M20 4C11.1634 4 4 11.1634 4 20" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>

      {/* DISCO GIRATORIO */}
      <div
        ref={wheelRef}
        className="relative w-full h-full rounded-full shadow-2xl overflow-hidden border-[8px] border-gray-800/90 box-border will-change-transform"
        style={{
          width: size,
          height: size,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {/* Fondo (Segmentos) */}
        <div
          className="absolute inset-0 w-full h-full rounded-full"
          style={{ background: bg }}
        />

        {/* Resaltado del Ganador (Wedge Overlay - Rotated) */}
        {segments.map((seg, i) => {
          if (!seg.isWinner) return null;
          return (
            <div key={`win-${i}`}
              className="absolute inset-0 w-full h-full rounded-full z-10 animate-pulse"
              style={{
                transform: `rotate(${i * degPer}deg)`
              }}
            >
              {/* Cuña exacta de 0 a degPer */}
              <div className="absolute inset-0 w-full h-full rounded-full"
                style={{
                  background: `conic-gradient(rgba(255, 215, 0, 0.4) 0deg, rgba(255, 215, 0, 0.4) ${degPer}deg, transparent ${degPer}deg)`
                }}
              />
              {/* Borde brillante en los bordes de la cuña */}
              <div className="absolute inset-0 w-full h-full rounded-full"
                style={{
                  background: `conic-gradient(rgba(255,255,255,0.8) 0deg 1deg, transparent 1deg ${degPer - 1}deg, rgba(255,255,255,0.8) ${degPer - 1}deg ${degPer}deg, transparent ${degPer}deg)`
                }}
              />
            </div>
          );
        })}

        {/* Separadores entre segmentos (Líneas finas) */}
        {segments.map((_, i) => {
          const angle = i * degPer;
          return (
            <div
              key={`sep-${i}`}
              className="absolute top-0 left-1/2 w-[1px] h-1/2 bg-white/20 origin-bottom"
              style={{
                transform: `translateX(-50%) rotate(${angle}deg)`,
                transformOrigin: "50% 100%"
              }}
            />
          );
        })}

        {/* Sombra interior (Vignette) para dar volumen 3D */}
        <div className="absolute inset-0 rounded-full shadow-[inset_0_0_40px_rgba(0,0,0,0.6)] pointer-events-none" />

        {/* Etiquetas - Radial (A lo largo) */}
        {labels.map(({ angle, i }) => {
          const seg = segments[i] ?? { label: `#${i + 1}` };

          const isWin = seg.isWinner;
          const isMe = seg.isYou;

          // Si es "Libre #X", simplificar
          const isLibre = seg.label.toLowerCase().startsWith("libre");
          const displayName = isLibre ? seg.label.replace("Libre ", "#") : seg.label;

          // Smart flipping para lectura radial
          const shouldFlip = angle > 90 && angle < 270;

          return (
            <div
              key={i}
              className="absolute top-0 left-1/2 h-1/2 w-0 origin-bottom flex flex-col justify-center items-center pointer-events-none z-20"
              style={{
                transform: `translateX(-50%) rotate(${angle}deg)`,
                paddingBottom: "10%" // Ligero ajuste para alejar del centro exacto
              }}
            >
              <div
                style={{
                  transform: shouldFlip ? "rotate(-90deg)" : "rotate(90deg)",
                  width: "140px", // Ancho fijo que actúa como largo radial
                  textAlign: "center",
                  textShadow: isWin || isMe ? "0 2px 4px rgba(0,0,0,0.8)" : "none",
                  color: isWin ? "#ffffff" : isMe ? "#ffffff" : isLibre ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)",
                }}
              >
                <span className={`block truncate px-1 ${isLibre ? "text-[10px] font-medium" : "text-[12px] font-bold uppercase tracking-wide"}`}>
                  {displayName}
                </span>
              </div>
            </div>
          );
        })}

        {/* CENTRO (Hub) */}
        <div
          className="absolute rounded-full z-10 flex items-center justify-center"
          style={{
            width: radius * 0.35,
            height: radius * 0.35,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle at 30% 30%, #374151, #111827)",
            boxShadow: "0 0 15px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.3)"
          }}
        >
          {/* Logo o detalle central */}
          <div className={`w-2/3 h-2/3 rounded-full border border-white/10 ${theme === "vip" ? "bg-amber-500/20" : "bg-white/5"} flex items-center justify-center`}>
            <div className="w-2 h-2 rounded-full bg-white/50 shadow-[0_0_10px_white]"></div>
          </div>
        </div>
      </div>

      {/* Reflejo superior (Gloss) estático */}
      <div
        className="absolute inset-4 rounded-full pointer-events-none z-20"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 40%)"
        }}
      />
    </div >
  );
}
