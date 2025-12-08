
import prisma from "@/modules/ui/lib/prisma";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";
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
    const bots = await prisma.user.findMany({
        where: { isBot: true },
        take: botsNeeded,
        orderBy: { createdAt: 'desc' }
    });

    if (bots.length < botsNeeded) {
        console.warn(`[Maintenance] Not enough bots in DB to fill room ${roomId}. Needed ${botsNeeded}, found ${bots.length}.`);
    }

    // 2. Prepare Entries
    const occupiedPositions = new Set(freshRoom.entries.map(e => e.position));
    let availablePositions = Array.from({ length: freshRoom.capacity }, (_, i) => i + 1).filter(p => !occupiedPositions.has(p));
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

    // 3. SPECIAL LOGIC PER GAME TYPE
    if (freshRoom.gameType === "DICE_DUEL") {
        // Should have 1 real player + 1 bot (in entriesToCreate) => Total 2
        // We need to simulate the duel result.

        const realPlayer = freshRoom.entries[0];
        const botUserId = entriesToCreate[0]?.userId; // Assuming 1 bot needed

        if (!botUserId) {
            console.error("No bot available for Dice Duel maintenance");
            return freshRoom;
        }

        // Generate Rolls
        const roll1 = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)] as [number, number];
        const roll2 = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)] as [number, number];

        const sum1 = roll1[0] + roll1[1];
        const sum2 = roll2[0] + roll2[1];

        // If tie, force P1 win for simplicity to avoid infinite loop or needing complex reroll logic in maintenance
        // Or just give it to P1. (Or reroll once).
        // Let's reroll once if tie.
        if (sum1 === sum2) {
            // cheap fix: nudge one value
            if (roll1[0] < 6) roll1[0]++; else roll1[0]--;
        }
        const finalSum1 = roll1[0] + roll1[1];
        const finalSum2 = roll2[0] + roll2[1];

        const winnerUserId = finalSum1 > finalSum2 ? realPlayer.userId : botUserId;

        // Create Transaction
        // 1. Insert Bot Entry
        // 2. Update Room directly to FINISHED with meta

        const meta = {
            balances: { [realPlayer.userId]: freshRoom.priceCents, [botUserId]: freshRoom.priceCents }, // initial
            rolls: { [realPlayer.userId]: roll1, [botUserId]: roll2 },
            ready: {},
            history: [],
            dice: undefined,
            ended: true
        };

        // Note: Logic needs to determine winning ENTRY ID. 
        // We don't have the Bot's Entry ID yet (it's being created). 
        // Prisma createMany doesn't return IDs easily in all drivers, but we can separate the create.

        let botEntryId = "";

        await prisma.$transaction(async (tx) => {
            // Create Bot Entry individually to get ID
            const created = await tx.entry.create({
                data: {
                    roomId,
                    userId: botUserId,
                    position: availablePositions[0],
                    round: freshRoom.currentRound ?? 1
                }
            });
            botEntryId = created.id;

            const winningEntryId = winnerUserId === realPlayer.userId ? realPlayer.id : botEntryId;
            const prizeCents = freshRoom.priceCents * 2; // Simple bank

            await tx.room.update({
                where: { id: roomId },
                data: {
                    state: "FINISHED",
                    finishedAt: new Date(),
                    lockedAt: new Date(),
                    winningEntryId,
                    prizeCents,
                    gameMeta: meta as any,
                    autoLockAt: null
                }
            });

            // Payout winner
            await tx.user.update({
                where: { id: winnerUserId },
                data: { balanceCents: { increment: prizeCents } }
            });

            await tx.transaction.create({
                data: {
                    userId: winnerUserId,
                    amountCents: prizeCents,
                    kind: "WIN_CREDIT", // using string literal if enum not imported or TxKind available
                    reason: `Ganaste en Dados vs Bot`,
                    meta: { roomId }
                }
            });
        });

        const updated = await prisma.room.findUnique({ where: { id: roomId }, include: { entries: { include: { user: true } } } });
        if (updated) {
            await emitRoomUpdate(updated.id);
            await emitRoomsIndex();
        }
        return updated;
    }

    // --- GENERIC / ROULETTE LOGIC (Fallback) ---
    // Insert all bots
    if (entriesToCreate.length > 0) {
        await prisma.entry.createMany({ data: entriesToCreate });
    }

    // Refetch full entries to pick winner
    const finalRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: { entries: { where: { round: freshRoom.currentRound ?? 1 } } }
    });

    if (!finalRoom) return freshRoom;

    const finalEntries = finalRoom.entries;
    if (finalEntries.length === 0) return finalRoom;

    const winnerIndex = crypto.randomInt(0, finalEntries.length);
    const winner = finalEntries[winnerIndex];
    const prize = finalRoom.priceCents * (finalEntries.length); // Bank is sum of entries

    const updatedRoom = await prisma.$transaction(async (tx) => {
        const r = await tx.room.update({
            where: { id: roomId },
            data: {
                state: "FINISHED",
                finishedAt: new Date(),
                lockedAt: new Date(),
                winningEntryId: winner.id,
                prizeCents: prize,
                preselectedPosition: null, // Clear roulette preselect
                autoLockAt: null
            },
            include: { entries: { include: { user: true } } }
        });

        // Payout
        await tx.user.update({
            where: { id: winner.userId },
            data: { balanceCents: { increment: prize } }
        });

        await tx.transaction.create({
            data: {
                userId: winner.userId,
                amountCents: prize,
                kind: "WIN_CREDIT", // TxKind.WIN_CREDIT
                reason: `Victoria en Sala ${r.title}`,
                meta: { roomId: r.id }
            }
        });

        return r;
    });

    await emitRoomUpdate(updatedRoom.id);
    await emitRoomsIndex();

    return updatedRoom;
}

