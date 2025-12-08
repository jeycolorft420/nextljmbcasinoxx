
import { calculateRouletteOutcome, generateServerSeed } from "@/modules/games/shared/lib/provably-fair";

export function determineRouletteWinner(room: any, entries: any[]) {
    let winningEntry = null;

    // A. Preselected (Admin Debug/Rigging if enabled)
    if ((room as any).preselectedPosition) {
        winningEntry = entries.find(e => e.position === (room as any).preselectedPosition) ?? null;
    }
    // B. Normal Provably Fair
    else {
        let sSeed = room.currentServerSeed;
        if (!sSeed) {
            sSeed = generateServerSeed();
        }

        // Client Seed = Combined Entry IDs (sorted)
        const clientSeed = entries.map((e: any) => e.id).sort().join("-");

        const currentRound = (room as any).currentRound ?? 1;
        const outcomeIndex = calculateRouletteOutcome(sSeed, clientSeed, currentRound, entries.length);
        winningEntry = entries[outcomeIndex];
    }

    return winningEntry;
}

export const ROULETTE_MULTIPLIER = 10;
