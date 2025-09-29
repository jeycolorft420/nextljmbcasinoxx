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
  targetIndex?: number | null;   // índice ganador 0..n-1
  spinKey?: string | number;     // cambia para disparar el giro
  onSpinEnd?: () => void;
  size?: number;                 // px
  spinDurationMs?: number;       // default 8000 (8s) — puedes cambiar
};

const COLORS = [
  "#1f2937", "#111827", "#1f2937", "#111827",
  "#1f2937", "#111827", "#1f2937", "#111827",
  "#1f2937", "#111827", "#1f2937", "#111827",
];

export default function RouletteWheel({
  segments,
  targetIndex = null,
  spinKey,
  onSpinEnd,
  size = 360,
  spinDurationMs = 8000, // duración (ms). Si quieres 6s, pon 6000.
}: Props) {
  const n = segments.length || 12;
  const degPer = 360 / n;
  const radius = size / 2;

  // rotación acumulada (siempre horario)
  const [rotation, setRotation] = useState(0);
  const baseRotRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);

  const bg = useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const start = i * degPer;
      const end = (i + 1) * degPer;
      const color = COLORS[i % COLORS.length];
      parts.push(`${color} ${start}deg ${end}deg`);
    }
    return `conic-gradient(${parts.join(",")})`;
  }, [n, degPer]);

  const labels = useMemo(() => {
    return Array.from({ length: n }).map((_, i) => {
      const angle = (i + 0.5) * degPer; // centro
      return { angle, i };
    });
  }, [n, degPer]);

  // Giro controlado: SIEMPRE horario + al menos 3 vueltas
  useEffect(() => {
    if (targetIndex == null) return;

    const sectors = segments.length || 12;
    const localDegPer = 360 / sectors;

    // centro del sector objetivo
    const targetCenter = targetIndex * localDegPer + localDegPer / 2;

    // puntero ARRIBA y calibración
    const POINTER_ANGLE = 90;
    const CAL = 180; // ajusta fino si lo ves 1-2° corrido

    // ángulo deseado (mod 360)
    const desiredMod = ((POINTER_ANGLE + CAL - targetCenter) % 360 + 360) % 360;
    const currentMod = ((baseRotRef.current % 360) + 360) % 360;

    // delta mínima en sentido horario
    const alignDelta = ((desiredMod - currentMod) % 360 + 360) % 360;

    // 👇 EXACTAMENTE 3 vueltas completas + ajuste al objetivo
    const FULL_TURNS = 100;
    const target = baseRotRef.current + FULL_TURNS * 360 + alignDelta;

    const el = wheelRef.current;
    if (!el) return;

    // preparar (sin salto)
    el.style.transition = "none";
    el.style.transform = `rotate(${baseRotRef.current}deg)`;

    requestAnimationFrame(() => {
      el.style.transition = `transform ${spinDurationMs}ms cubic-bezier(0.17, 0.67, 0.16, 1)`;
      setRotation(target);
    });

    const id = setTimeout(() => {
      baseRotRef.current = target; // fija nueva base
      if (el) el.style.transition = "";
      onSpinEnd?.();
    }, spinDurationMs + 30);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey, targetIndex, spinDurationMs, segments.length]);

  return (
    <div style={{ width: size, height: size }} className="relative mx-auto">
      {/* Puntero */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-1 z-20">
        <div
          className="w-0 h-0"
          style={{
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderBottom: "18px solid #eab308",
          }}
        />
      </div>

      {/* Disco */}
      <div
        ref={wheelRef}
        className="rounded-full border border-white/20 shadow-xl will-change-transform"
        style={{
          width: size,
          height: size,
          background: bg,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {/* Centro */}
        <div
          className="absolute rounded-full bg-black/70 border border-white/10"
          style={{
            width: radius * 0.5,
            height: radius * 0.5,
            left: radius - radius * 0.25,
            top: radius - radius * 0.25,
          }}
        />

        {/* Etiquetas */}
        {labels.map(({ angle, i }) => {
          const seg = segments[i] ?? { label: `#${i + 1}` };
          const textRadius = radius * 0.78;
          const rad = (angle * Math.PI) / 180;
          const cx = radius + textRadius * Math.cos(rad);
          const cy = radius + textRadius * Math.sin(rad);

          const color = seg.isWinner
            ? "#22c55e"
            : seg.isYou
            ? "#60a5fa"
            : seg.muted
            ? "#9ca3af"
            : "#e5e7eb";

          return (
            <div
              key={i}
              className="absolute text-[12px] font-medium select-none"
              style={{
                left: cx,
                top: cy,
                transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                transformOrigin: "center",
                color,
                whiteSpace: "nowrap",
                textShadow: "0 1px 1px rgba(0,0,0,0.6)",
              }}
            >
              {seg.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
