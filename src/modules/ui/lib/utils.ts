// src/lib/utils.ts
export type DiceColor = "green" | "blue" | "yellow" | "red" | "purple"| "pink";

export const DICE_COLORS: Record<
  DiceColor,
  { bg: string; pip: string }
> = {
  green:  { bg: "linear-gradient(135deg,#a7f3d0,#10b981)", pip: "#064e3b" },
  blue:   { bg: "linear-gradient(135deg,#bfdbfe,#3b82f6)", pip: "#0b265d" },
  yellow: { bg: "linear-gradient(135deg,#fde68a,#f59e0b)", pip: "#5b3700" },
  red:    { bg: "linear-gradient(135deg,#fecaca,#ef4444)", pip: "#5f0a0a" },
  purple: { bg: "linear-gradient(135deg,#e9d5ff,#8b5cf6)", pip: "#2f175c" },
  pink:   { bg: "linear-gradient(135deg,#fbcfe8,#ec4899)", pip: "#5f0b2c" },
};


export function getDiceColors(color?: string | null) {
  const key = (color || "").toLowerCase() as DiceColor;
  return DICE_COLORS[key] ?? DICE_COLORS.green;
}

/**
 * Genera un objeto style para aplicar en un <div> del dado.
 * Uso:
 *   const { bg, pip } = getDiceColors(userSelectedColor);
 *   <div style={{ background: bg }}> ... pips con color pip ... </div>
 */
export function diceStyleFor(color?: string | null) {
  const c = getDiceColors(color);
  return { background: c.bg };
}

