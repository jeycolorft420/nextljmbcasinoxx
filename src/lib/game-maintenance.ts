
import prisma from "@/lib/prisma";
import { emitRoomUpdate, emitRoomsIndex } from "@/lib/emit-rooms";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

// Helper to determine if a room needs maintenance
export async function checkAndMaintenanceRoom(room: any) {
    // If not OPEN or no autoLockAt or time hasn't passed, do nothing
    if (room.state !== "OPEN" || !room.autoLockAt || new Date() < room.autoLockAt) {
        return room;
    }

    const roomId = room.id;

    // We need to fetch FRESH data (especially entries count) to be sure
    // running inside a transaction to prevent race conditions would be ideal, 
    // but for lazy logic a fresh fetch is usually enough.
    const freshRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
            entries: { where: { round: room.currentRound ?? 1 } },
            _count: { select: { entries: { where: { round: room.currentRound ?? 1 } } } }
        }
    });

    if (!freshRoom || freshRoom.state !== "OPEN") return room;

    const now = new Date();

    // Double check time expiry on fresh object
    if (!freshRoom.autoLockAt || now < freshRoom.autoLockAt) return freshRoom;

    const playerCount = freshRoom._count.entries;

    // SCENARIO A: Insufficient players (<= 1)
    // Action: Extend timer UNLESS it's a DICE DUEL (1v1) where 1 player is waiting for opponent
    const isDiceDuel = freshRoom.gameType === "DICE_DUEL";
    const isWaitingForOpponent = isDiceDuel && playerCount === 1;

    if (playerCount <= 1 && !isWaitingForOpponent) {
        console.log(`[Maintenance] Room ${roomId} has ${playerCount} players. Extending timer.`);
        const newLockTime = new Date(now.getTime() + 5 * 60 * 1000); // +5 minutes

        const updated = await prisma.room.update({
            where: { id: roomId },
            data: { autoLockAt: newLockTime }
        });

        // We don't necessarily need to emit socket update for a timer extension if we don't want to spam,
        // but it helps frontend sync.
        // await emitRoomUpdate(updated.id); 

        return { ...freshRoom, autoLockAt: newLockTime };
    }

    // SCENARIO B: Enough players (> 1)
    // Action: Fill with bots and finish
    console.log(`[Maintenance] Room ${roomId} has ${playerCount} players. Filling with bots and finishing.`);

    const botsNeeded = freshRoom.capacity - playerCount;

    // 1. Fetch random bots
    // We can pick random bots from DB. 
    // Optimization: Fetch a few random bots.
    const bots = await prisma.user.findMany({
        where: { isBot: true },
        take: botsNeeded,
        orderBy: { createdAt: 'desc' } // Simple pick, or random skip could be better but this works for MVP
    });

    if (bots.length < botsNeeded) {
        console.warn(`[Maintenance] Not enough bots in DB to fill room ${roomId}. Needed ${botsNeeded}, found ${bots.length}.`);
        // Just proceed with available bots or extend? Let's proceed with what we have + existing players.
    }

    // 2. Add bots to room
    // We need to determine occupied positions to avoid collision
    const occupiedPositions = new Set(freshRoom.entries.map(e => e.position));
    let availablePositions = Array.from({ length: freshRoom.capacity }, (_, i) => i + 1).filter(p => !occupiedPositions.has(p));

    // Shuffle available positions
    availablePositions.sort(() => Math.random() - 0.5);

    const entriesToCreate: Prisma.EntryCreateManyInput[] = [];

    bots.forEach((bot, idx) => {
        if (idx < availablePositions.length) {
            entriesToCreate.push({
                roomId: roomId,
                userId: bot.id,
                position: availablePositions[idx],
                round: freshRoom.currentRound ?? 1
            });
        }
    });

    // Transaction: Create bot entries + Finish room
    // This ensures atomicity.

    // Pick winner logic: 
    // The winner must be picked from ALL entries (real + new bots).
    // Since we haven't inserted bots yet, we simulate the pool.

    const allParticipantIds = [
        ...freshRoom.entries.map(e => ({ id: e.id, userId: e.userId })), // Existing entries (id is predictable? No, existing entries have IDs)
        // We don't have IDs for new entries yet.
    ];

    // Actually, simpler approach:
    // 1. Insert Bots
    // 2. Fetch all entries
    // 3. Pick winner
    // 4. Update Room to FINISHED

    // We do updates in order.
    if (entriesToCreate.length > 0) {
        await prisma.entry.createMany({ data: entriesToCreate });
    }

    // Refetch full entries to pick winner
    const finalRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: { entries: { where: { round: freshRoom.currentRound ?? 1 } } }
    });

    if (!finalRoom) return freshRoom; // Should not happen

    const finalEntries = finalRoom.entries;
    if (finalEntries.length === 0) return finalRoom; // Should not happen 

    const winnerIndex = crypto.randomInt(0, finalEntries.length);
    const winner = finalEntries[winnerIndex];

    const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: {
            state: "FINISHED",
            finishedAt: new Date(),
            lockedAt: new Date(), // It's effectively locked now
            winningEntryId: winner.id,
            prizeCents: finalRoom.priceCents * 10, // Example multiplier/prize logic from existing code
            preselectedPosition: null,
            autoLockAt: null // Clear timer
        },
        include: { entries: { include: { user: true } } }
    });

    // Emit updates
    await emitRoomUpdate(updatedRoom.id);
    await emitRoomsIndex();

    return updatedRoom;
}
