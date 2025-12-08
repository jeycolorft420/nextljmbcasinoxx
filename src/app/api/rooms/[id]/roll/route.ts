import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { emitRoomUpdate } from "@/modules/rooms/lib/emit-rooms";
import { buildRoomPayload } from "@/modules/rooms/lib/room-payload";

const paramSchema = z.object({ id: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const userId = (session.user as any).id;

        const { id } = paramSchema.parse(await ctx.params);

        // Lock room
        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT 1 FROM "Room" WHERE "id" = ${id} FOR UPDATE`;

            const room = await tx.room.findUnique({
                where: { id },
                include: { entries: { include: { user: true } } }
            });

            if (!room) throw new Error("Room not found");
            if (room.gameType !== "DICE_DUEL") throw new Error("Not a dice room");
            // We use LOCKED for "In Progress"
            if (room.state !== "LOCKED") throw new Error("Not ready to roll");

            // Ensure 2 players
            if (room.entries.length < 2) throw new Error("Waiting for players");

            // Sort entries by position (1 = Top, 2 = Bottom)
            const p1 = room.entries.find(e => e.position === 1);
            const p2 = room.entries.find(e => e.position === 2);

            if (!p1 || !p2) throw new Error("Invalid players");

            // Check Meta
            const meta = (room.gameMeta as any) || {};
            const rolls = meta.rolls || {}; // { [userId]: [1, 5] }

            // Whose turn?
            // If P1 hasn't rolled, it's P1 turn.
            // If P1 rolled, P2 hasn't, it's P2 turn.
            let turnUserId = null;
            if (!rolls[p1.userId]) turnUserId = p1.userId;
            else if (!rolls[p2.userId]) turnUserId = p2.userId;
            else throw new Error("All rolled"); // Should be finished

            if (userId !== turnUserId) {
                return { error: "Not your turn", status: 403 };
            }

            // Roll!
            const roll = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];

            // Update Meta
            const currentRolls = { ...rolls, [userId]: roll };

            // Prepare final objects
            let finalMeta = { ...meta, rolls: currentRolls };
            let finalState: "OPEN" | "LOCKED" | "FINISHED" = room.state;
            let finalWinnerEntryId = null;
            let finalPrize = null;

            if (currentRolls[p1.userId] && currentRolls[p2.userId]) {
                // Both rolled. Calculate result.
                const s1 = currentRolls[p1.userId][0] + currentRolls[p1.userId][1];
                const s2 = currentRolls[p2.userId][0] + currentRolls[p2.userId][1];

                console.log("🎲 ROLL DEBUG:", {
                    p1: p1.userId,
                    p2: p2.userId,
                    r1: currentRolls[p1.userId],
                    r2: currentRolls[p2.userId],
                    s1, s2
                });

                let roundWinnerId = null;
                let diff = 0;

                if (s1 > s2) {
                    roundWinnerId = p1.userId;
                    diff = s1 - s2;
                } else if (s2 > s1) {
                    roundWinnerId = p2.userId;
                    diff = s2 - s1;
                }

                // Initialize balances if missing
                if (!finalMeta.balances) {
                    finalMeta.balances = { [p1.userId]: room.priceCents, [p2.userId]: room.priceCents };
                }
                const balances = { ...finalMeta.balances };

                const FIXED_DAMAGE = Math.max(1, Math.floor(room.priceCents / 5));

                if (roundWinnerId) {
                    const loserId = roundWinnerId === p1.userId ? p2.userId : p1.userId;
                    const damage = FIXED_DAMAGE;

                    // Transfer funds
                    balances[loserId] -= damage;
                    balances[roundWinnerId] += damage;
                    finalMeta.balances = balances;

                    // History
                    const history = finalMeta.history || [];
                    const roundDice = { top: currentRolls[p1.userId], bottom: currentRolls[p2.userId] };

                    console.log("🎲 LAST DICE DEBUG:", {
                        p1: p1.userId,
                        p2: p2.userId,
                        r1: currentRolls[p1.userId],
                        r2: currentRolls[p2.userId],
                        roundDice
                    });

                    history.push({
                        round: (room.currentRound || 0) + 1,
                        winnerEntryId: roundWinnerId === p1.userId ? p1.id : p2.id,
                        dice: roundDice,
                        balancesAfter: { ...balances }
                    });
                    finalMeta.history = history;
                    finalMeta.lastDice = roundDice;

                    // Check Bankruptcy
                    if (balances[loserId] <= 0) {
                        // Game Over
                        // CLAMP BALANCES for clean display
                        balances[loserId] = 0;
                        balances[roundWinnerId] = room.priceCents * 2;
                        finalMeta.balances = balances; // Update meta with clamped values

                        finalWinnerEntryId = roundWinnerId === p1.userId ? p1.id : p2.id;
                        finalPrize = room.priceCents * 2;
                        finalState = "FINISHED";
                        finalMeta.message = `¡Juego Terminado! ${roundWinnerId === p1.userId ? "P1" : "P2"} gana todo.`;
                    } else {
                        // Continue - Reset rolls for next round
                        finalMeta.rolls = {}; // EXPLICITLY CLEAR ROLLS
                        finalMeta.message = `Ronda: ${s1} vs ${s2}. Ganador toma $${damage / 100} (20%).`;
                        finalState = "LOCKED";
                    }
                } else {
                    // Tie - Reset rolls
                    // NEW: Add Tie to History
                    const history = finalMeta.history || [];
                    const roundDice = { top: currentRolls[p1.userId], bottom: currentRolls[p2.userId] };

                    history.push({
                        round: (room.currentRound || 0) + 1,
                        winnerEntryId: null, // No winner
                        dice: roundDice,
                        balancesAfter: { ...finalMeta.balances } // Balances unchanged
                    });
                    finalMeta.history = history;

                    finalMeta.rolls = {}; // EXPLICITLY CLEAR ROLLS
                    finalMeta.lastDice = roundDice;
                    finalMeta.message = "Empate. Nadie pierde dinero.";
                    finalState = "LOCKED";
                }
            } else {
                finalState = "LOCKED"; // Waiting for other player
            }

            // Update DB
            const updated = await tx.room.update({
                where: { id },
                data: {
                    state: finalState,
                    gameMeta: finalMeta,
                    winningEntryId: finalWinnerEntryId,
                    prizeCents: finalPrize,
                    finishedAt: finalState === "FINISHED" ? new Date() : null,
                    currentRound: { increment: (finalState === "LOCKED" && currentRolls[p1.userId] && currentRolls[p2.userId]) ? 1 : 0 }
                }
            });

            // If finished, create GameResult?
            if (finalState === "FINISHED" && finalWinnerEntryId) {
                const wEntry = room.entries.find(e => e.id === finalWinnerEntryId)!;
                await tx.gameResult.create({
                    data: {
                        roomId: id,
                        winnerUserId: wEntry.userId,
                        winnerName: wEntry.user.name,
                        prizeCents: finalPrize!,
                        roundNumber: room.currentRound ?? 1,
                    }
                });
                return { success: true, updated, winnerUserId: wEntry.userId, prize: finalPrize };
            }

            return { success: true, updated };
        });

        // ... Handle result (Credit wallet, Emit) ...
        if ((result as any).error) return NextResponse.json({ error: (result as any).error }, { status: (result as any).status });

        // Credit if winner
        if ((result as any).winnerUserId) {
            // ... credit ...
        }

        // Emit
        const payload = await buildRoomPayload(prisma, id);
        if (payload) await emitRoomUpdate(id, payload);

        return NextResponse.json({ ok: true, roll: (result as any).updated.gameMeta });

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Unknown error" }, { status: 400 });
    }
}

