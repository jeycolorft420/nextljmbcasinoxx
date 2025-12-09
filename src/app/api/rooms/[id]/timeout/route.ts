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
        const p = await ctx.params;
        console.log(`[TimeoutRoute] POST request for room ${p.id}`);
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const userId = (session.user as any).id;

        const { id } = paramSchema.parse(await ctx.params);
        const body = await req.json().catch(() => ({}));
        const { round } = body; // Expect round number from client

        // Lock room
        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT 1 FROM "Room" WHERE "id" = ${id} FOR UPDATE`;

            const room = await tx.room.findUnique({
                where: { id },
                include: { entries: { include: { user: true } } }
            });

            if (!room) throw new Error("Room not found");
            if (room.gameType !== "DICE_DUEL") throw new Error("Not a dice room");
            if (room.state !== "LOCKED" && room.state !== "OPEN") throw new Error("Game not active");

            // Ensure 2 players
            if (room.entries.length < 2) throw new Error("Waiting for players");

            // VALIDATE ROUND (Prevent Lagging Client Timeouts)
            if (round && round !== (room.currentRound ?? 1)) {
                return { success: false, ignored: true }; // Ignore old timeouts
            }

            const meEntry = room.entries.find(e => e.userId === userId);
            const opponentEntry = room.entries.find(e => e.userId !== userId);

            if (!meEntry || !opponentEntry) throw new Error("Invalid players");

            // CHECK: Is it actually my turn? OR is opponent taking too long?
            // Actually, client timer handles "when" to call this.
            // Server should verify that:
            // 1. I have NOT rolled yet (actually I could have rolled and be waiting for them?)
            // 2. Opponent has NOT rolled.
            // If I already rolled, and they haven't, I win by timeout.
            // If I haven't rolled, and they haven't needed to (e.g. they are waiting for me), then I forfeit?
            // "Timeout" usually means "I ran out of time" -> I lose. 
            // OR "Opponent ran out of time" -> I win.

            // The client calls `handleTimeout` when `timeLeft` hits 0.
            // `dice_timer` matches specific round and user.
            // So if *I* timed out, I forfeit.
            // We need to support "Claim Win" if opponent timed out too?
            // For now, let's assume this endpoint is called when "I" time out (automatic forfeiture).

            // BUT, if the bot gets stuck, the USER needs to be able to "Claim Win" or the system needs to auto-forfeit the bot.
            // The `maintenance.ts` handles the bot logic. 
            // This `timeout` route seems to be "I timed out, so I lose".

            // Confirmed with code analysis:
            // `history.push({ ... winnerEntryId: opponentEntry.id ... })` -> Opponent wins. 
            // So this IS a "I Give Up / I Lost" endpoint.

            // PROBLEM: User said "Bugged and doesn't let real user throw, causing them to lose by time".
            // So the user sees "Your Turn", tries to throw, but maybe can't? Or bot doesn't throw, so user waits, then user timer runs out?
            // If it's P2 bot, P1 rolls, then waits for P2. P1 timer shouldn't run if it's P2 turn.

            const meta = (room.gameMeta as any) || {};
            const rolls = meta.rolls || {};

            // Validation: Don't allow timeout if round already ended or invalid state
            if (room.state === "FINISHED" as any) return { success: true }; // Harmless idempotency

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
            // Update DB
            const updated = await tx.room.update({
                where: { id },
                data: {
                    state: finalState === "FINISHED" ? "FINISHED" : "OPEN", // Ensure OPEN if continuing
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
                kind: "WIN_CREDIT",
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

