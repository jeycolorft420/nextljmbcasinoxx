
import prisma from "@/modules/ui/lib/prisma";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

// Helper to determine if a room needs maintenance
export async function checkAndMaintenanceRoom(room: any) {
    const isDiceDuel = room.gameType === "DICE_DUEL" && ["OPEN", "LOCKED"].includes(room.state);

    // If not OPEN or no autoLockAt or time hasn't passed, do nothing (Unless it's an active Dice Duel)
    if (!isDiceDuel && (room.state !== "OPEN" || !room.autoLockAt || new Date() < room.autoLockAt)) {
        return room;
    }

    const roomId = room.id;

    // We need to fetch FRESH data (especially entries count) to be sure
    // running inside a transaction to prevent race conditions would be ideal, 
    // but for lazy logic a fresh fetch is usually enough.
    const freshRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
            entries: true,
            _count: { select: { entries: true } }
        }
    });

    if (!freshRoom) return room;

    const isFreshDiceDuel = freshRoom.gameType === "DICE_DUEL" && ["OPEN", "LOCKED"].includes(freshRoom.state);
    if (!isFreshDiceDuel && freshRoom.state !== "OPEN") return room;

    const now = new Date();

    // Double check time expiry on fresh object (Skip for active duel)
    if (!isFreshDiceDuel && (!freshRoom.autoLockAt || now < freshRoom.autoLockAt)) return freshRoom;

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

    // 3. SPECIAL LOGIC PER GAME TYPE (Dice Duel Battle System)
    if (freshRoom.gameType === "DICE_DUEL") {
        const meta = (freshRoom.gameMeta as any) || {};
        const rolls = meta.rolls || {};
        let balances = meta.balances || {};
        const autoPlay = meta.autoPlay || false;

        const p1 = freshRoom.entries.find((e: any) => e.position === 1);
        const p2 = freshRoom.entries.find((e: any) => e.position === 2);

        // Init balances if missing (Health = Price)
        if (p1 && !balances[p1.userId]) balances[p1.userId] = freshRoom.priceCents;

        // A) ADD BOT IF NEEDED (Timer Expired & 1 Player)
        if (!p2 && freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt) {
            console.log(`[Maintenance] Dice Duel Timeout. Adding Bot.`);
            let botUser = bots[0];
            if (!botUser) botUser = await prisma.user.findFirst({ where: { isBot: true } });

            if (botUser) {
                await prisma.entry.create({
                    data: {
                        roomId,
                        userId: botUser.id,
                        position: 2,
                        round: freshRoom.currentRound ?? 1
                    }
                });

                // Init bot balance
                balances[botUser.id] = freshRoom.priceCents;

                const updated = await prisma.room.update({
                    where: { id: roomId },
                    data: {
                        autoLockAt: null,
                        gameMeta: {
                            ...meta,
                            balances,
                            roundStartedAt: Date.now(), // Start timer for delay
                            autoPlay: false // Disable global autoPlay, rely on isBot check
                        } as any
                    }
                });
                await emitRoomUpdate(roomId);
                return updated;
            }
        }

        // B) GAME LOOP
        if (p1 && p2) {
            // Ensure P2 balance exists if just joined
            if (!balances[p2.userId]) balances[p2.userId] = freshRoom.priceCents;

            let p1Rolled = !!rolls[p1.userId];
            let p2Rolled = !!rolls[p2.userId];
            let changesMade = false;

            // Fetch Bot Status
            const p1Data = await prisma.user.findUnique({ where: { id: p1.userId }, select: { isBot: true } });
            const p2Data = await prisma.user.findUnique({ where: { id: p2.userId }, select: { isBot: true } });
            const p1IsBot = p1Data?.isBot ?? false;
            const p2IsBot = p2Data?.isBot ?? false;

            // Check Delay (Use roundStartedAt or default to now if missing)
            const roundStartedAt = (meta.roundStartedAt as number) || 0;
            const canBotAct = Date.now() >= roundStartedAt + 2000; // 2 seconds delay

            // 1. AUTO ROLLS (Bots Only)
            if (!p1Rolled && p1IsBot && canBotAct) {
                rolls[p1.userId] = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)];
                p1Rolled = true;
                changesMade = true;
            }

            if (!p2Rolled && p2IsBot && canBotAct) {
                rolls[p2.userId] = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)];
                p2Rolled = true;
                changesMade = true;
            }

            // 2. RESOLVE ROUND (If both rolled)
            if (p1Rolled && p2Rolled) {
                const r1 = rolls[p1.userId];
                const r2 = rolls[p2.userId];
                const sum1 = r1[0] + r1[1];
                const sum2 = r2[0] + r2[1];

                // Damage: Fixed 20% of room price per round
                let damage = Math.max(1, Math.floor(freshRoom.priceCents * 0.20));
                let roundWinner = null;

                if (sum1 > sum2) {
                    // P1 Wins
                    balances[p2.userId] -= damage;
                    balances[p1.userId] += damage; // Transfer: Zero-Sum Game
                    roundWinner = p1.userId;
                } else if (sum2 > sum1) {
                    // P2 Wins
                    balances[p1.userId] -= damage;
                    balances[p2.userId] += damage; // Transfer: Zero-Sum Game
                    roundWinner = p2.userId;
                } else {
                    // Tie - No damage
                    damage = 0;
                }

                // Push History
                const historyEntry = {
                    rolls: { [p1.userId]: r1, [p2.userId]: r2 },
                    winnerUserId: roundWinner,
                    damage,
                    timestamp: Date.now(),
                    round: (meta.history?.length || 0) + 1,
                    balancesAfter: { ...balances }
                };
                const newHistory = [...(meta.history || []), historyEntry];

                const lastDice = {
                    top: r1, // NOTE: DiceBoard usually maps these by ID, safe to store raw
                    bottom: r2,
                    [p1.userId]: r1,
                    [p2.userId]: r2
                };

                // Check Death
                const p1Dead = balances[p1.userId] <= 0;
                const p2Dead = balances[p2.userId] <= 0;

                if (p1Dead || p2Dead) {
                    const winnerId = p1Dead ? p2.id : p1.id;
                    const winnerUserId = p1Dead ? p2.userId : p1.userId;
                    const prizeCents = freshRoom.priceCents * 2;

                    await prisma.$transaction(async (tx) => {
                        await tx.room.update({
                            where: { id: roomId },
                            data: {
                                state: "FINISHED",
                                finishedAt: new Date(),
                                winningEntryId: winnerId,
                                prizeCents,
                                gameMeta: {
                                    ...meta,
                                    balances,
                                    history: newHistory,
                                    rolls,
                                    ended: true
                                } as any
                            }
                        });

                        await tx.user.update({
                            where: { id: winnerUserId },
                            data: { balanceCents: { increment: prizeCents } }
                        });

                        await tx.transaction.create({
                            data: {
                                userId: winnerUserId,
                                amountCents: prizeCents,
                                kind: "WIN_CREDIT",
                                reason: "Victoria Dados (Combate)",
                                meta: { roomId }
                            }
                        });
                    });

                    await emitRoomUpdate(roomId);
                    await emitRoomsIndex();
                    return { ...freshRoom, state: "FINISHED" };

                } else {
                    // CONTINUE - Set new Round Start Time
                    await prisma.room.update({
                        where: { id: roomId },
                        data: {
                            currentRound: { increment: 1 },
                            gameMeta: {
                                ...meta,
                                balances,
                                history: newHistory,
                                rolls: {}, // CLEAR
                                lastDice,
                                roundStartedAt: Date.now() // RESET CLOCK FOR NEXT ROUND
                            } as any
                        }
                    });
                    await emitRoomUpdate(roomId);
                    return freshRoom;
                }
            } else if (changesMade) {
                await prisma.room.update({
                    where: { id: roomId },
                    data: { gameMeta: { ...meta, rolls } as any }
                });
                await emitRoomUpdate(roomId);
                return freshRoom;
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

    let winner = finalEntries[0];
    // Roulette: Winner is random (or preselected)
    const winnerIndex = crypto.randomInt(0, finalEntries.length);
    winner = finalEntries[winnerIndex];

    const prize = finalRoom.priceCents * 10; // Fixed 10x payout (2 slots for house)

    const updatedRoom = await prisma.$transaction(async (tx) => {
        const r = await tx.room.update({
            where: { id: roomId },
            data: {
                state: "FINISHED",
                finishedAt: new Date(),
                lockedAt: new Date(),
                winningEntryId: winner.id,
                prizeCents: prize,
                preselectedPosition: null,
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
                kind: "WIN_CREDIT",
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

