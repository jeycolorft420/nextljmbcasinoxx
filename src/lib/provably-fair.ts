import { createHmac, randomBytes, createHash } from "crypto";

export function generateServerSeed() {
    return randomBytes(32).toString("hex");
}

export function generateHash(seed: string) {
    return createHash("sha256").update(seed).digest("hex");
}

export function calculateRouletteOutcome(serverSeed: string, clientSeed: string, nonce: number, maxSegments: number) {
    // HMAC_SHA256(serverSeed, clientSeed:nonce)
    const message = `${clientSeed}:${nonce}`;
    const hmac = createHmac("sha256", serverSeed).update(message).digest("hex");

    // Tomar los primeros 8 caracteres (32 bits) para un entero
    // Esto es un estándar común (e.g. Stake, Roobet)
    const int = parseInt(hmac.substring(0, 8), 16);

    // Modulo maxSegments
    return int % maxSegments;
}
