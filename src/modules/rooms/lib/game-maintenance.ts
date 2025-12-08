
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

    // SCENARIO A: Insufficient players (0)
    if (playerCount === 0) {
        // No one here. Just clear timer to stop polling loop or reset.
        await prisma.room.update({
            where: { id: roomId },
            data: { autoLockAt: null }
        });
        return { ...freshRoom, autoLockAt: null };
    }

    // SCENARIO B: Play (1 or more players).
    // If timer expired, we fill with bots and finish.
    console.log(`[Maintenance] Room ${roomId} has ${playerCount} players. Timer expired. Filling with bots.`);

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
        const meta = (freshRoom.gameMeta as any) || {};
        const rolls = meta.rolls || {};

        const p1 = freshRoom.entries.find((e: any) => e.position === 1);
        const p2 = freshRoom.entries.find((e: any) => e.position === 2);

        // A) ADD BOT IF NEEDED (Timer Expired & 1 Player)
        // Only if we haven't already filled the room (p2 missing)
        if (!p2 && freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt) {
            console.log(`[Maintenance] Dice Duel Timeout. Adding Bot.`);
            // 1. Get Bot
            // Re-use the "bots" array fetched earlier or fetch one specific
            let botUser = bots[0];
            if (!botUser) {
                // Try to fetch one if local array empty
                botUser = await prisma.user.findFirst({ where: { isBot: true } });
            }
            if (!botUser) return freshRoom;

            await prisma.entry.create({
                data: {
                    roomId,
                    userId: botUser.id,
                    position: 2, // Duel is 1v1, if p2 missing it's pos 2
                    round: freshRoom.currentRound ?? 1
                }
            });

            const updated = await prisma.room.update({
                where: { id: roomId },
                data: { autoLockAt: null }
            });

            await emitRoomUpdate(roomId);
            return updated;
        }

        // B) GAME LOOP (If 2 players)
        if (p1 && p2) {
            const p1Rolled = !!rolls[p1.userId];
            const p2Rolled = !!rolls[p2.userId];

            // 1. CHECK FINISH (Both rolled)
            if (p1Rolled && p2Rolled) {
                // Calculate Winner
                const r1 = rolls[p1.userId];
                const r2 = rolls[p2.userId];
                const sum1 = r1[0] + r1[1];
                const sum2 = r2[0] + r2[1];

                let winnerId = null;
                if (sum1 > sum2) winnerId = p1.id;
                else if (sum2 > sum1) winnerId = p2.id;
                else {
                    // Tie - For MVP we can just Tie Breaker or Give it to P1 or Refund.
                    // Let's give to P1 to ensure finish (or random).
                    winnerId = p1.id;
                }

                // Finish Room
                const prizeCents = freshRoom.priceCents * 2;

                await prisma.$transaction(async (tx) => {
                    const winnerEntry = freshRoom.entries.find((e: any) => e.id === winnerId);
                    const winnerUserId = winnerEntry?.userId;

                    await tx.room.update({
                        where: { id: roomId },
                        data: {
                            state: "FINISHED",
                            finishedAt: new Date(),
                            winningEntryId: winnerId,
                            prizeCents,
                            // autoLockAt: null // already null
                            gameMeta: { ...meta, ended: true } as any
                        }
                    });

                    if (winnerUserId) {
                        await tx.user.update({
                            where: { id: winnerUserId },
                            data: { balanceCents: { increment: prizeCents } }
                        });
                        await tx.transaction.create({
                            data: {
                                userId: winnerUserId,
                                amountCents: prizeCents,
                                kind: "WIN_CREDIT",
                                reason: "Victoria Dados",
                                meta: { roomId }
                            }
                        });
                    }
                });

                await emitRoomUpdate(roomId);
                await emitRoomsIndex();
                return { ...freshRoom, state: "FINISHED" };
            }

            // 2. CHECK BOT TURN
            // Logic: P1 goes first.
            let activeEntry = null;
            if (!p1Rolled) activeEntry = p1;
            else if (!p2Rolled) activeEntry = p2;

            if (activeEntry) {
                // Is this entry a bot?
                // We need to know if user is bot. The entry.user usually has minimal fields.
                // We did "include: { entries: { include: { user: true } } }" in previous calls?
                // Step 19: "entries: { where: { ... } }" - Default include might not have isBot.
                // Let's assume we need to fetch user or trust `isBot` if available.
                // Or check "bots" list.

                // Efficient check: fetch user isBot status
                const u = await prisma.user.findUnique({ where: { id: activeEntry.userId }, select: { isBot: true } });

                if (u?.isBot) {
                    console.log(`[Maintenance] Bot Move for ${activeEntry.userId}`);
                    // Execute Roll
                    const r = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)];

                    const newMeta = {
                        ...meta,
                        rolls: { ...rolls, [activeEntry.userId]: r },
                        lastDice: { ...meta.lastDice, [activeEntry.position === 1 ? 'top' : 'bottom']: r }
                    };

                    await prisma.room.update({
                        where: { id: roomId },
                        data: { gameMeta: newMeta as any }
                    });

                    await emitRoomUpdate(roomId);
                    return { ...freshRoom, gameMeta: newMeta };
                }
            }
        }

        return freshRoom;
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

