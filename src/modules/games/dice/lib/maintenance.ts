import prisma from "@/modules/ui/lib/prisma";
import crypto from "crypto";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";

export async function maintenanceDiceDuel(room: any, freshRoom: any) {
    const roomId = room.id;
    const meta = (freshRoom.gameMeta as any) || {};
    const rolls = meta.rolls || {};
    let balances = meta.balances || {};

    // Find Players
    const p1 = freshRoom.entries.find((e: any) => e.position === 1);
    const p2 = freshRoom.entries.find((e: any) => e.position === 2);

    // 🔍 DEBUG: Log Player Data Integrity
    console.log(`[DiceDuel] 🔍 Players Check: P1=${p1?.userId.slice(0, 5)}.. (User=${!!p1?.user}), P2=${p2?.userId.slice(0, 5)}.. (User=${!!p2?.user})`);
    console.log(`[DiceDuel] 🎲 Active Rolls:`, JSON.stringify(rolls));

    // Init P1 balance if missing
    if (p1 && !balances[p1.userId]) balances[p1.userId] = freshRoom.priceCents;

    // 🕒 CHECK FOR RESOLVING PHASE (State: "RESOLVING")
    const resolvingUntil = (meta.roundResolvingUntil as number) || 0;
    const now = Date.now();

    // 🔍 LOGS: ENTRY
    console.log(`[DiceDuel] Maintenance Tick | Room: ${roomId} | Round: ${freshRoom.currentRound} | State: ${freshRoom.state} | ResolvingUntil: ${resolvingUntil} | Now: ${now}`);

    if (resolvingUntil > 0) {
        if (now < resolvingUntil) {
            // ⏳ Still Resolving
            return freshRoom;
        } else {
            // ⏩ RESOLUTION FINISHED -> START NEXT ROUND
            const nextRound = (freshRoom.currentRound ?? 1) + 1;
            console.log(`[DiceDuel] ⏩ Round ${freshRoom.currentRound} Resolved. Transitioning to Round ${nextRound}`);

            // Determine starter based on last winner (stored in meta or calculate?)
            // We can infer next starter from the history's last entry
            const lastHistory = meta.history?.[meta.history.length - 1];
            // If Tie (winnerUserId is null), preserve the previous starter to maintain order (or default to P1)
            const nextStarter = lastHistory?.winnerUserId || meta.nextStarterUserId || p1.userId;

            // Perform Transaction
            const [updatedRoom] = await prisma.$transaction([
                prisma.room.update({
                    where: { id: roomId },
                    data: {
                        state: "OPEN",
                        currentRound: nextRound,
                        gameMeta: {
                            ...meta,
                            rolls: {}, // RESET ROLLS
                            lastDice: meta.lastDice,
                            roundResolvingUntil: 0,
                            nextStarterUserId: nextStarter,
                            roundStartedAt: Date.now() // Reset Bot Clock
                        } as any
                    },
                    include: { entries: { include: { user: true } } } // Return entries to ensure we have latest
                }),
                prisma.entry.updateMany({
                    where: { roomId: roomId, round: freshRoom.currentRound ?? 1 },
                    data: { round: nextRound }
                })
            ]);
            await emitRoomUpdate(roomId);
            return updatedRoom;
        }
    }

    /* -------------------------------------------------------------------------- */
    /* SCENARIO A: BOT MANAGEMENT (Uniqueness & Cleanup)                     */
    /* -------------------------------------------------------------------------- */

    // 1. ANTI-LONELINESS: Si solo hay 1 jugador y es un BOT, sacarlo.
    if (p1 && !p2) {
        const userP1 = await prisma.user.findUnique({ where: { id: p1.userId } });
        if (userP1?.isBot) {
            console.log(`[DiceDuel] 🧹 Removing lonely bot ${userP1.name} from room ${roomId}`);
            await prisma.entry.delete({ where: { id: p1.id } });
            // Devolvemos la sala a estado OPEN limpio
            const cleaned = await prisma.room.update({
                where: { id: roomId },
                data: { state: "OPEN", autoLockAt: null, gameMeta: {} as any },
                include: { entries: { include: { user: true } } }
            });
            await emitRoomUpdate(roomId);
            return cleaned;
        }
    }

    // 2. ADD BOT (Smart Selection)
    if (!p2 && freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt) {
        console.log(`[DiceMaintenance] Timer Expired. Looking for available bot...`);

        // Buscamos un bot que NO esté jugando actualmente
        let botUser = await prisma.user.findFirst({
            where: {
                isBot: true,
                // CRÍTICO: Asegurar que no esté en otra sala activa
                entries: {
                    none: {
                        room: {
                            state: { in: ["OPEN", "LOCKED"] }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' } // O 'updatedAt' para rotación
        });

        if (botUser) {
            console.log(`[DiceDuel] 🤖 Adding Bot: ${botUser.name} to Room ${roomId}`);
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
                        roundStartedAt: Date.now(),
                        autoPlay: false
                    } as any
                },
                include: { entries: { include: { user: true } } }
            });
            await emitRoomUpdate(roomId);
            return updated;
        } else {
            console.log("[DiceDuel] ⚠️ No available bots found (all busy).");
        }
    }

    /* -------------------------------------------------------------------------- */
    /*                         SCENARIO B: GAME LOOP                              */
    /* -------------------------------------------------------------------------- */
    if (p1 && p2) {
        // 🚨 FIX: Iniciar reloj en el primer turno si viene vacío
        if (!meta.roundStartedAt || meta.roundStartedAt === 0) {
            console.log(`[DiceDuel] 🏁 Starting first round clock for Room ${roomId}`);
            const startedRoom = await prisma.room.update({
                where: { id: roomId },
                data: { gameMeta: { ...meta, roundStartedAt: Date.now() } as any },
                include: { entries: { include: { user: true } } }
            });
            await emitRoomUpdate(roomId);
            return startedRoom;
        }

        // Init P2 Balance
        if (!balances[p2.userId]) balances[p2.userId] = freshRoom.priceCents;

        let p1Rolled = !!rolls[p1.userId];
        let p2Rolled = !!rolls[p2.userId];
        let changesMade = false;

        // Fetch IsBot Status
        const p1Data = await prisma.user.findUnique({ where: { id: p1.userId }, select: { isBot: true } });
        const p2Data = await prisma.user.findUnique({ where: { id: p2.userId }, select: { isBot: true } });
        const p1IsBot = p1Data?.isBot ?? false;
        const p2IsBot = p2Data?.isBot ?? false;

        // 🕒 Check Bot Delay
        const roundStartedAt = (meta.roundStartedAt as number) || 0;
        const canBotAct = now >= roundStartedAt + 2000; // 2 seconds

        // 1. EXECUTE TURNS (Bot Logic & Human Timeout)
        const starterId = meta.nextStarterUserId || p1.userId;
        const secondId = starterId === p1.userId ? p2.userId : p1.userId;

        // Determine who needs to roll next
        let nextToRollId = null;
        if (!rolls[starterId]) nextToRollId = starterId;
        else if (!rolls[secondId]) nextToRollId = secondId;

        // Force roll if it's bot's turn
        if (nextToRollId) {
            const isBotTurn = (nextToRollId === p1.userId && p1IsBot) || (nextToRollId === p2.userId && p2IsBot);

            // A) BOT LOGIC
            if (isBotTurn) {
                // RELAXED BOT TIMING/CHECK
                // Only consider "stuck" if roundStartedAt is actually set (>0)
                const isStuck = roundStartedAt > 0 && (now - roundStartedAt) > 5000;

                if (canBotAct || isStuck) {
                    // Ensure we don't roll too fast if round just started (sanity check)
                    // But canBotAct covers that (2s delay).

                    rolls[nextToRollId] = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)];
                    if (nextToRollId === p1.userId) p1Rolled = true;
                    if (nextToRollId === p2.userId) p2Rolled = true;
                    changesMade = true;
                    console.log(`[DiceDuel] 🎲 Bot ${nextToRollId} Rolled.`);
                }
            }
            // B) HUMAN TIMEOUT LOGIC
            else {
                // 35s Grace Period (Client UI is 30s)
                if (roundStartedAt > 0 && (now - roundStartedAt) > 35000) {
                    console.log(`[DiceDuel] ⏰ Human Timeout for ${nextToRollId}. Forfeiting.`);
                    const forfeiterId = nextToRollId;
                    const winnerId = forfeiterId === p1.userId ? p2.userId : p1.userId;
                    const winnerEntry = winnerId === p1.userId ? p1 : p2;

                    // Apply Damage
                    const damage = Math.max(1, Math.floor(freshRoom.priceCents * 0.20));
                    balances[forfeiterId] -= damage;
                    balances[winnerId] += damage;

                    // History
                    const roundDice = { top: null, bottom: null };
                    const historyEntry = {
                        rolls: {},
                        dice: roundDice,
                        winnerUserId: winnerId,
                        damage,
                        timestamp: Date.now(),
                        round: freshRoom.currentRound ?? (meta.history?.length || 0) + 1,
                        balancesAfter: { ...balances },
                        winnerEntryId: winnerEntry.id,
                        timeoutForfeiterUserId: forfeiterId
                    };
                    const newHistory = [...(meta.history || []), historyEntry];

                    // Check Bankruptcy
                    if (balances[forfeiterId] <= 0) {
                        // Game Over
                        console.log(`[DiceDuel] 💀 Player ${forfeiterId} bankrupt by timeout.`);

                        const updatedRoom = await prisma.room.update({
                            where: { id: roomId },
                            data: {
                                state: "FINISHED",
                                finishedAt: new Date(),
                                winningEntryId: winnerEntry.id,
                                prizeCents: freshRoom.priceCents * 2,
                                gameMeta: { ...meta, balances, history: newHistory, rolls: {}, ended: true } as any
                            },
                            include: { entries: { include: { user: true } } }
                        });

                        // Credit Winner
                        await prisma.user.update({
                            where: { id: winnerId },
                            data: { balanceCents: { increment: freshRoom.priceCents * 2 } }
                        });

                        // Transaction Record
                        await prisma.transaction.create({
                            data: {
                                userId: winnerId,
                                amountCents: freshRoom.priceCents * 2,
                                kind: "WIN_CREDIT",
                                reason: "Victoria Dados (Timeout)",
                                meta: { roomId }
                            }
                        });

                        await emitRoomUpdate(roomId);
                        await emitRoomsIndex();
                        return updatedRoom;

                    } else {
                        // Next Round
                        console.log(`[DiceDuel] ⏩ Timeout Resolved. Next Round.`);
                        const updatedRoom = await prisma.room.update({
                            where: { id: roomId },
                            data: {
                                currentRound: { increment: 1 },
                                gameMeta: {
                                    ...meta,
                                    balances,
                                    history: newHistory,
                                    rolls: {},
                                    lastDice: roundDice,
                                    roundResolvingUntil: 0,
                                    nextStarterUserId: winnerId, // Winner starts next
                                    roundStartedAt: Date.now()
                                } as any
                            },
                            include: { entries: true }
                        });
                        await emitRoomUpdate(roomId);
                        return updatedRoom;
                    }
                }
            }
        }

        // 2. RESOLVE ROUND (If both rolled)
        if (p1Rolled && p2Rolled) {
            // 🛡️ CRITICAL GUARD: Prevent duplicate resolution
            const alreadyResolved = meta.history?.some((h: any) => h.round === freshRoom.currentRound);
            if (alreadyResolved) {
                console.warn(`[DiceDuel] ⚠️ Race Condition Guard: Round ${freshRoom.currentRound} already in history. Skipping.`);
                return freshRoom;
            }

            console.log(`[DiceDuel] ⚔️ Resolving Round ${freshRoom.currentRound}...`);

            const r1 = rolls[p1.userId];
            const r2 = rolls[p2.userId];
            const sum1 = r1[0] + r1[1];
            const sum2 = r2[0] + r2[1];

            // 💥 Damage: 20% of Entry Price
            let damage = Math.max(1, Math.floor(freshRoom.priceCents * 0.20));
            let roundWinner = null;

            if (sum1 > sum2) {
                balances[p2.userId] -= damage;
                balances[p1.userId] += damage;
                roundWinner = p1.userId;
            } else if (sum2 > sum1) {
                balances[p1.userId] -= damage;
                balances[p2.userId] += damage;
                roundWinner = p2.userId;
            } else {
                damage = 0; // Tie
            }

            // History Log
            const roundDice = { top: r1, bottom: r2 };
            console.log(`[DiceDuel] 📜 Adding History: Round ${freshRoom.currentRound}, Dice:`, roundDice);

            const historyEntry = {
                rolls: { [p1.userId]: r1, [p2.userId]: r2 },
                dice: roundDice, // 👈 ADDED for RoomHistoryList compatibility
                winnerUserId: roundWinner,
                damage,
                timestamp: Date.now(),
                round: freshRoom.currentRound ?? (meta.history?.length || 0) + 1,
                balancesAfter: { ...balances },
                winnerEntryId: roundWinner === p1.userId ? p1.id : (roundWinner === p2.userId ? p2.id : null)
            };
            const newHistory = [...(meta.history || []), historyEntry];

            // Last Dice for Visuals
            const lastDice = {
                top: r1,
                bottom: r2,
                [p1.userId]: r1,
                [p2.userId]: r2
            };

            // 💀 Check Death
            const p1Dead = balances[p1.userId] <= 0;
            const p2Dead = balances[p2.userId] <= 0;

            if (p1Dead || p2Dead) {
                // Determine Final Winner
                const winnerEntry = p1Dead ? p2 : p1;
                const winnerUserId = winnerEntry.userId;
                const prizeCents = freshRoom.priceCents * 2; // Winner takes all

                const updatedRoom = await prisma.$transaction(async (tx) => {
                    // Update Room
                    const r = await tx.room.update({
                        where: { id: roomId },
                        data: {
                            state: "FINISHED",
                            finishedAt: new Date(),
                            winningEntryId: winnerEntry.id,
                            prizeCents,
                            gameMeta: {
                                ...meta,
                                balances,
                                history: newHistory,
                                rolls,
                                ended: true
                            } as any
                        },
                        include: { entries: { include: { user: true } } }
                    });

                    // Update Wallet
                    await tx.user.update({
                        where: { id: winnerUserId },
                        data: { balanceCents: { increment: prizeCents } }
                    });

                    // Log Transaction
                    await tx.transaction.create({
                        data: {
                            userId: winnerUserId,
                            amountCents: prizeCents,
                            kind: "WIN_CREDIT",
                            reason: "Victoria Dados (Combate)",
                            meta: { roomId }
                        }
                    });

                    return r;
                });

                await emitRoomUpdate(roomId);
                await emitRoomsIndex();
                return updatedRoom;

            } else {
                // ⏸️ NEW DELAY LOGIC: Set Timer, DO NOT clear rolls yet.
                const delayRoom = await prisma.room.update({
                    where: { id: roomId },
                    data: {
                        gameMeta: {
                            ...meta,
                            balances,
                            history: newHistory,
                            rolls, // Keep rolls for visualization
                            lastDice,
                            // Next Starter handled in resolution
                            // Next Starter handled in resolution
                            roundResolvingUntil: Date.now() + 6000 // 6 Seconds Delay
                        } as any
                    },
                    include: { entries: { include: { user: true } } }
                });
                console.log(`[DiceDuel] Round ${freshRoom.currentRound} Resolved. Entering Wait Phase (4s).`);
                await emitRoomUpdate(roomId);
                return delayRoom;
            }

        } else if (changesMade) {
            // Save Partial State (e.g. one person rolled)
            const partialRoom = await prisma.room.update({
                where: { id: roomId },
                data: {
                    gameMeta: {
                        ...meta,
                        rolls,
                        roundStartedAt: Date.now() // 🕒 RESET TIMER ON TURN CHANGE
                    } as any
                },
                include: { entries: { include: { user: true } } }
            });
            await emitRoomUpdate(roomId);
            return partialRoom;
        }
    }

    return freshRoom;
}
