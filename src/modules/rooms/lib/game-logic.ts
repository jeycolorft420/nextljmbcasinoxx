import { RoomState } from "@prisma/client";
import prisma from "@/modules/ui/lib/prisma";

// NOTE: This generic function is now mostly Legacy/Fallback. 
// Ideally "maintenanceRoulette" and "maintenanceDiceDuel" handle the finish logic themselves 
// to ensure game-specific rules (like bots) are respected.

// However, we keeping this for the "Force Finish" button in Admin Panel or edge cases.
export async function finishRoom(roomId: string) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: { entries: { include: { user: true } } }
    });

    if (!room) throw new Error("Room not found");
    if (room.state === "FINISHED") return room; // Idempotent

    // For Roulette, we prefer the maintenance logic because it handles BOTS.
    // If this is called manually (e.g. Admin Button), we might be finishing a non-full room.
    // That's okay for Admin force-finish.

    // Calculate winner
    const entries = room.entries.filter(e => e.round === room.currentRound);
    if (entries.length === 0) return room; // Can't finish empty room

    // Generic random winner
    const winnerIndex = Math.floor(Math.random() * entries.length);
    const winner = entries[winnerIndex];
    let prize = 0;

    if (room.gameType === "ROULETTE") {
        prize = room.priceCents * 10;
    } else if (room.gameType === "DICE_DUEL") {
        prize = room.priceCents * 2;
    }

    const updated = await prisma.$transaction(async (tx) => {
        const r = await tx.room.update({
            where: { id: roomId },
            data: {
                state: RoomState.FINISHED,
                finishedAt: new Date(),
                winningEntryId: winner.id,
                prizeCents: prize,
                autoLockAt: null
            },
            include: { entries: { include: { user: true } } }
        });

        await tx.user.update({
            where: { id: winner.userId },
            data: { balanceCents: { increment: prize } }
        });

        await tx.transaction.create({
            data: {
                userId: winner.userId,
                amountCents: prize,
                kind: "WIN_CREDIT",
                reason: `Victoria Manual en ${room.title}`,
                meta: { roomId, forced: true }
            }
        });

        return r;
    });

    return updated;
}

export async function processWinnerPayout(room: any) {
    // Legacy helper, now logic is usually inline transaction
    return;
}
