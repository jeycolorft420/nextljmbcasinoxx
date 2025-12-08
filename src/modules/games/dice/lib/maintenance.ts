import prisma from "@/modules/ui/lib/prisma";
import crypto from "crypto";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";

export async function maintenanceDiceDuel(room: any, freshRoom: any) {
    const roomId = room.id;
    const meta = (freshRoom.gameMeta as any) || {};
    const rolls = meta.rolls || {};
    let balances = meta.balances || {};

    // We do NOT use global autoPlay anymore for humans, only for pure bot-vs-bot or bot auto-response
    // const autoPlay = meta.autoPlay || false; 

    // Find Players
    const p1 = freshRoom.entries.find((e: any) => e.position === 1);
    const p2 = freshRoom.entries.find((e: any) => e.position === 2);

    // Init P1 balance if missing
    if (p1 && !balances[p1.userId]) balances[p1.userId] = freshRoom.priceCents;

    /* -------------------------------------------------------------------------- */
    /*                         SCENARIO A: ADD BOT (TIMEOUT)                      */
    /* -------------------------------------------------------------------------- */
    if (!p2 && freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt) {
        console.log(`[DiceMaintenance] Timer Expired. Adding Bot.`);

        let botUser = await prisma.user.findFirst({
            where: { isBot: true },
            orderBy: { createdAt: 'desc' } // Just pick one
        });

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
                        roundStartedAt: Date.now(), // 🕒 Start the 2s Delay Clock
                        autoPlay: false
                    } as any
                }
            });
            await emitRoomUpdate(roomId);
            return updated;
        }
    }

    /* -------------------------------------------------------------------------- */
    /*                         SCENARIO B: GAME LOOP                              */
    /* -------------------------------------------------------------------------- */
    if (p1 && p2) {
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
        const now = Date.now();
        const canBotAct = now >= roundStartedAt + 2000; // 2 seconds

        // 1. EXECUTE BOT ROLLS (Dynamic Turn Order)
        const starterId = meta.nextStarterUserId || p1.userId;
        const secondId = starterId === p1.userId ? p2.userId : p1.userId;

        // Determine who needs to roll next
        let nextToRollId = null;
        if (!rolls[starterId]) nextToRollId = starterId;
        else if (!rolls[secondId]) nextToRollId = secondId;

        // Force roll if it's bot's turn
        if (nextToRollId && canBotAct) {
            const isBotTurn = (nextToRollId === p1.userId && p1IsBot) || (nextToRollId === p2.userId && p2IsBot);

            if (isBotTurn) {
                rolls[nextToRollId] = [crypto.randomInt(1, 7), crypto.randomInt(1, 7)];
                if (nextToRollId === p1.userId) p1Rolled = true;
                if (nextToRollId === p2.userId) p2Rolled = true;
                changesMade = true;
                console.log(`[DiceDuel] 🎲 Bot ${nextToRollId} Forced Roll (Dynamic Order)`);
            }
        }

        // 2. RESOLVE ROUND (If both rolled)
        if (p1Rolled && p2Rolled) {
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
            const historyEntry = {
                rolls: { [p1.userId]: r1, [p2.userId]: r2 },
                winnerUserId: roundWinner,
                damage,
                timestamp: Date.now(),
                round: (meta.history?.length || 0) + 1,
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

                await prisma.$transaction(async (tx) => {
                    // Update Room
                    await tx.room.update({
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
                        }
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
                });

                await emitRoomUpdate(roomId);
                await emitRoomsIndex();
                return { ...freshRoom, state: "FINISHED" };

            } else {
                // 🔄 NEXT ROUND
                await prisma.room.update({
                    where: { id: roomId },
                    data: {
                        currentRound: { increment: 1 },
                        gameMeta: {
                            ...meta,
                            balances,
                            history: newHistory,
                            rolls: {}, // Reset rolls
                            lastDice,
                            nextStarterUserId: roundWinner || meta.nextStarterUserId, // Winner starts, or keep previous if tie
                            roundStartedAt: Date.now() // Reset Delay Timer
                        } as any
                    }
                });
                await emitRoomUpdate(roomId);
                return freshRoom;
            }

        } else if (changesMade) {
            // Save Partial State (e.g. one person rolled)
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
