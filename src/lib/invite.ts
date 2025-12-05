// src/lib/invite.ts
import crypto from "crypto";

/**
 * Payload del invite.
 * - roomId: sala a la que se invita
 * - game: "DICE_DUEL" (por ahora sólo dados 1v1)
 * - exp: unix epoch (segundos) de expiración
 * - inviterId?: opcional, para referencia
 */
export type InvitePayload = {
  roomId: string;
  game: "DICE_DUEL";
  exp: number; // seconds
  inviterId?: string;
};

const algo = "sha256";
function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET || "";
  if (!s) {
    throw new Error("Falta NEXTAUTH_SECRET para firmar invites");
  }
  return s;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(input: string) {
  const pad = 4 - (input.length % 4 || 4);
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad === 4 ? 0 : pad);
  return Buffer.from(base64, "base64");
}

/** Firma determinística HMAC-SHA256 del payload (json base64url). */
function hmacSign(b64json: string) {
  const key = getSecret();
  const h = crypto.createHmac(algo, key);
  h.update(b64json);
  return b64url(h.digest());
}

/** Crea token: <payloadB64Url>.<signatureB64Url> */
export function signInvite(payload: InvitePayload): string {
  const json = JSON.stringify(payload);
  const body = b64url(json);
  const sig = hmacSign(body);
  return `${body}.${sig}`;
}

/** Verifica token; devuelve payload si es válido/no expirado; si no, null. */
export function verifyInvite(token: string): InvitePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = hmacSign(body);
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const json = b64urlDecode(body).toString("utf8");
    const data = JSON.parse(json) as InvitePayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof data.exp !== "number" || data.exp <= now) return null;
    if (data.game !== "DICE_DUEL") return null;
    if (!data.roomId) return null;
    return data;
  } catch {
    return null;
  }
}

/** Helper para generar un payload con expiración en X minutos. */
export function makeInvitePayload(opts: {
  roomId: string;
  inviterId?: string;
  minutes?: number; // default 15
}): InvitePayload {
  const { roomId, inviterId, minutes = 15 } = opts;
  const exp = Math.floor(Date.now() / 1000) + minutes * 60;
  return { roomId, inviterId, exp, game: "DICE_DUEL" };
}
