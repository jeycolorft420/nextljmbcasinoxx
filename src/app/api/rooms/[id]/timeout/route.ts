import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { emitRoomUpdate } from "@/modules/rooms/lib/emit-rooms";
import { buildRoomPayload } from "@/modules/rooms/lib/room-payload";
import { walletCredit } from "@/modules/users/lib/wallet";

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
            if (room.state !== "LOCKED") throw new Error("Game not active");

            // Ensure 2 players
            if (room.entries.length < 2) throw new Error("Waiting for players");

            const meEntry = room.entries.find(e => e.userId === userId);
            const opponentEntry = room.entries.find(e => e.userId !== userId);

            if (!meEntry || !opponentEntry) throw new Error("Invalid players");

            // Logic: Apply damage to ME, credit Opponent.
            const meta = (room.gameMeta as any) || {};

            // Initialize balances if missing
            if (!meta.balances) {
                meta.balances = { [meEntry.userId]: room.priceCents, [opponentEntry.userId]: room.priceCents };
            }
            const balances = { ...meta.balances };

            const FIXED_DAMAGE = Math.max(1, Math.floor(room.priceCents / 5));

            // Transfer funds
            balances[userId] -= FIXED_DAMAGE;
            balances[opponentEntry.userId] += FIXED_DAMAGE;
            meta.balances = balances;

            let finalState: "LOCKED" | "FINISHED" = "LOCKED";
            let finalWinnerEntryId = null;
            let finalPrize = null;

            // History
            const history = meta.history || [];
            // No dice rolled, but we record the event
            const roundDice = { top: null, bottom: null };

            history.push({
                round: (room.currentRound || 0) + 1,
                winnerEntryId: opponentEntry.id,
                dice: roundDice,
                balancesAfter: { ...balances },
                timeoutForfeiterUserId: userId // Flag for UI
            });
            meta.history = history;
            meta.lastDice = roundDice;

            // Check Bankruptcy
            if (balances[userId] <= 0) {
                // Game Over
                balances[userId] = 0;
                balances[opponentEntry.userId] = room.priceCents * 2;
                meta.balances = balances;

                finalWinnerEntryId = opponentEntry.id;
                finalPrize = room.priceCents * 2;
                finalState = "FINISHED";
                meta.message = `¡Juego Terminado! ${opponentEntry.user.name} gana por bancarrota.`;
            } else {
                // Continue
                meta.rolls = {}; // Clear rolls
                meta.message = `${meEntry.user.name} perdió la ronda por tiempo.`;
                finalState = "LOCKED";
            }

            // Update DB
            const updated = await tx.room.update({
                where: { id },
                data: {
                    state: finalState,
                    gameMeta: meta,
                    winningEntryId: finalWinnerEntryId,
                    prizeCents: finalPrize,
                    finishedAt: finalState === "FINISHED" ? new Date() : null,
                    currentRound: { increment: 1 }
                }
            });

            // If finished, create GameResult
            if (finalState === "FINISHED" && finalWinnerEntryId) {
                await tx.gameResult.create({
                    data: {
                        roomId: id,
                        winnerUserId: opponentEntry.userId,
                        winnerName: opponentEntry.user.name,
                        prizeCents: finalPrize!,
                        roundNumber: room.currentRound ?? 1,
                    }
                });
                return { success: true, updated, winnerUserId: opponentEntry.userId, prize: finalPrize };
            }

            return { success: true, updated };
        });

        // Credit if winner
        if ((result as any).winnerUserId) {
            await walletCredit({
                userId: (result as any).winnerUserId,
                amountCents: (result as any).prize,
                reason: `Victoria en Dice Duel`,
                kind: "WIN",
                meta: { roomId: id }
            });
        }

        // Emit
        const payload = await buildRoomPayload(prisma, id);
        if (payload) await emitRoomUpdate(id, payload);

        return NextResponse.json({ ok: true });

    } catch (e: any) {
        console.error("timeout error:", e);
        return NextResponse.json({ error: e.message || "Unknown error" }, { status: 400 });
    }
}

