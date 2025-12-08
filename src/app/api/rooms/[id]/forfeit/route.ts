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

        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT 1 FROM "Room" WHERE "id" = ${id} FOR UPDATE`;

            const room = await tx.room.findUnique({
                where: { id },
                include: { entries: { include: { user: true } } }
            });

            if (!room) throw new Error("Room not found");
            if (room.gameType !== "DICE_DUEL") throw new Error("Not a dice room");
            if (room.state !== "LOCKED") throw new Error("Game not active");

            // Find players
            const meEntry = room.entries.find(e => e.userId === userId);
            const opponentEntry = room.entries.find(e => e.userId !== userId);

            if (!meEntry || !opponentEntry) throw new Error("Invalid players");

            // Forfeit Logic:
            // 1. Me loses everything.
            // 2. Opponent wins everything (Pot).
            // 3. Game Ends.

            const prize = room.priceCents * 2; // Full pot

            // Update Room
            const updated = await tx.room.update({
                where: { id },
                data: {
                    state: "FINISHED",
                    winningEntryId: opponentEntry.id,
                    prizeCents: prize,
                    finishedAt: new Date(),
                    gameMeta: {
                        ...(room.gameMeta as any),
                        forfeit: true,
                        loserId: userId,
                        message: `${meEntry.user.name || "Jugador"} se ha rendido.`
                    }
                }
            });

            // Create Game Result
            await tx.gameResult.create({
                data: {
                    roomId: id,
                    winnerUserId: opponentEntry.userId,
                    winnerName: opponentEntry.user.name,
                    prizeCents: prize,
                    roundNumber: room.currentRound ?? 1,
                }
            });

            return { success: true, winnerId: opponentEntry.userId, prize };
        });

        // Credit Winner
        if (result.winnerId) {
            await walletCredit({
                userId: result.winnerId,
                amountCents: result.prize,
                reason: `Victoria por abandono en Dice Duel`,
                kind: "WIN",
                meta: { roomId: id }
            });
        }

        // Emit Update
        const payload = await buildRoomPayload(prisma, id);
        if (payload) await emitRoomUpdate(id, payload);

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error("forfeit error:", e);
        return NextResponse.json({ error: e.message || "Error" }, { status: 400 });
    }
}

