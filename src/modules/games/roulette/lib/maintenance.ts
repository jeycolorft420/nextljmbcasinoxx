import prisma from "@/modules/ui/lib/prisma";
import crypto from "crypto";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";
import { Prisma } from "@prisma/client";

export async function maintenanceRoulette(room: any, freshRoom: any) {
    const roomId = room.id;
    // CRITICAL FIX: Only count players in the CURRENT ROUND.
    // freshRoom.entries includes history, so freshRoom._count.entries gives total history (wrong).
    const currentEntries = freshRoom.entries.filter((e: any) => e.round === (freshRoom.currentRound ?? 1));
    const playerCount = currentEntries.length;

    // SCENARIO 1: Insufficient players (0) - Reset Timer
    if (playerCount === 0) {
        await prisma.room.update({
            where: { id: roomId },
            data: { autoLockAt: null }
        });
        return { ...freshRoom, autoLockAt: null };
    }

    // 🔒 ATOMIC LOCK CLAIM (CAS)
    // Only proceed if we can successfully set autoLockAt to NULL (meaning we consume the timer)
    // This prevents multiple threads from running maintenance simultaneously.
    // If autoLockAt is ALREADY null (because another thread took it), this update returns count: 0

    // NOTE: We only try to claim if autoLockAt is NOT NULL.
    // If it's already null, maintenance shouldn't be running anyway (checked in wrapper),
    // but another thread might have just cleared it.
    const claim = await prisma.room.updateMany({
        where: {
            id: roomId,
            autoLockAt: { not: null }
        },
        data: { autoLockAt: null }
    });

    if (claim.count === 0) {
        // Lock already claimed by another thread OR timer was already null
        console.log(`[Roulette] Maintenance skipped (Lock busy) for ${roomId}`);
        return freshRoom;
    }


    // SCENARIO 2: Fill with Bots and Finish
    console.log(`[Roulette] Room ${roomId} lock claimed. Filling with bots.`);

    // DEBUG: Check counts
    console.log(`[Roulette] Current Round: ${freshRoom.currentRound ?? 1}, Total Entries Payload: ${freshRoom.entries.length}, Valid Entries: ${playerCount}`);

    let botsNeeded = freshRoom.capacity - playerCount;
    if (botsNeeded < 0) botsNeeded = 0; // Prevent negative take

    // 🛡️ SECURITY: Fetch bots
    const bots = await prisma.user.findMany({
        where: { isBot: true },
        take: botsNeeded,
        orderBy: { createdAt: 'desc' }
    });

    // CRITICAL: If we don't have enough bots, we MUST revert the lock (restore timer)
    // Otherwise the room stays stuck with autoLockAt = null and never finishes.
    if (bots.length < botsNeeded) {
        console.warn(`[Roulette] Not enough bots to fill room ${roomId}. Needed ${botsNeeded}, found ${bots.length}. Total Bots avail: ${await prisma.user.count({ where: { isBot: true } })}. Restoring timer.`);

        // 🔄 RESTORE TIMER used as Lock
        await prisma.room.update({
            where: { id: roomId },
            data: { autoLockAt: new Date(Date.now() + 10000) } // Retry in 10s
        });
        return freshRoom;
    }

    // 2. Prepare Entries
    const occupiedPositions = new Set(currentEntries.map((e: any) => e.position));
    let availablePositions = Array.from({ length: freshRoom.capacity }, (_, i) => i + 1).filter(p => !occupiedPositions.has(p));

    // Shuffle positions for realism
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

    // 3. Insert Bots
    if (entriesToCreate.length > 0) {
        await prisma.entry.createMany({ data: entriesToCreate });
    }

    // 4. Refetch to get ALL entries (including new bots) for winner selection
    const finalRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: { entries: { where: { round: freshRoom.currentRound ?? 1 }, include: { user: true } } }
    });

    if (!finalRoom || finalRoom.entries.length === 0) return freshRoom;

    // 5. Select Winner
    const finalEntries = finalRoom.entries;
    console.log(`[Roulette] Picking winner from ${finalEntries.length} entries.`);
    const winnerIndex = crypto.randomInt(0, finalEntries.length);
    const winner = finalEntries[winnerIndex];

    const prize = finalRoom.priceCents * 10; // Fixed 10x payout (Standard Roulette 1/10)

    // 6. Execute Payout & Finish
    const updatedRoom = await prisma.$transaction(async (tx) => {
        const r = await tx.room.update({
            where: { id: roomId },
            data: {
                state: "FINISHED",
                finishedAt: new Date(),
                lockedAt: new Date(),
                winningEntryId: winner.id,
                prizeCents: prize,
                preselectedPosition: null, // Clear override
                autoLockAt: null
            },
            // FIX: Filter entries by ROUND so frontend receives correct list
            include: { entries: { where: { round: freshRoom.currentRound ?? 1 }, include: { user: true } } }
        });

        // Payout to User Wallet
        await tx.user.update({
            where: { id: winner.userId },
            data: { balanceCents: { increment: prize } }
        });

        // Log Transaction
        await tx.transaction.create({
            data: {
                userId: winner.userId,
                amountCents: prize,
                kind: "WIN_CREDIT",
                reason: `Victoria en Sala ${r.title}`,
                meta: { roomId: r.id }
            }
        });

        // 📝 LOG GAME RESULT (HISTORY)
        await tx.gameResult.create({
            data: {
                roomId: r.id,
                winnerUserId: winner.userId,
                winnerName: winner.user.name ?? "Jugador",
                prizeCents: prize,
                roundNumber: freshRoom.currentRound ?? 1
            }
        });

        return r;
    });

    // 7. Emit Updates
    await emitRoomUpdate(updatedRoom.id);
    await emitRoomsIndex();

    return updatedRoom;
}
