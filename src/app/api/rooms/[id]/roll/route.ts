import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { emitRoomUpdate } from "@/modules/rooms/lib/emit-rooms";
import { buildRoomPayload } from "@/modules/rooms/lib/room-payload";
import { checkAndMaintenanceRoom } from "@/modules/rooms/lib/game-maintenance";

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
            if (room.state !== "LOCKED" && room.state !== "OPEN") throw new Error("Not ready to roll");

            // Ensure 2 players
            if (room.entries.length < 2) throw new Error("Waiting for players");

            // Sort entries by position (1 = Top, 2 = Bottom)
            const p1 = room.entries.find(e => e.position === 1);
            const p2 = room.entries.find(e => e.position === 2);

            if (!p1 || !p2) throw new Error("Invalid players");

            // Check Meta
            const meta = (room.gameMeta as any) || {};
            console.log(`[DiceRollRoute] 🔓 Room State: ${room.state}, ResolvingUntil=${meta.roundResolvingUntil || 0}, CurrentRolls=${JSON.stringify(meta.rolls)}`);

            // 🛡️ GUARD: Resolving Phase
            if (meta.roundResolvingUntil && Date.now() < meta.roundResolvingUntil) {
                console.warn(`[DiceRollRoute] 🛑 REJECTED: Round is resolving.`);
                return { error: "Ronda finalizando, espera...", status: 400 };
            }

            const rolls = meta.rolls || {}; // { [userId]: [1, 5] }

            // Whose turn?
            // Determine Starter (P1 by default, or dynamic)
            const starterId = meta.nextStarterUserId || p1.userId;
            const secondId = starterId === p1.userId ? p2.userId : p1.userId;

            let turnUserId = null;
            if (!rolls[starterId]) turnUserId = starterId;
            else if (!rolls[secondId]) turnUserId = secondId;
            else throw new Error("All rolled"); // Should be finished

            // Validation
            if (userId !== turnUserId) {
                // Determine name of who we are waiting for
                const waitingFor = room.entries.find(e => e.userId === turnUserId)?.user.name || "Opponent";
                return { error: `Wait for ${waitingFor}`, status: 403 };
            }

            // Roll!
            const roll = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];

            // Update Meta & Rolls
            const currentRolls = { ...rolls, [userId]: roll };

            // Log Roll
            console.log(`[DiceDuel] 🎲 User ${userId} Rolled: [${roll}]`);

            // Trigger maintenance only if round is full (2 players)
            const shouldResolve = Object.keys(currentRolls).length >= 2;

            // CORRECCIÓN APLICADA: Reiniciar timer al tirar
            const finalMeta = {
                ...meta,
                rolls: currentRolls,
                roundStartedAt: Date.now() // <--- ESTO ES OBLIGATORIO
            };

            // Update DB (Just save roll)
            const updated = await tx.room.update({
                where: { id },
                data: {
                    gameMeta: finalMeta
                }
            });



            return { success: true, updated, shouldResolve };
        });

        if ((result as any).error) return NextResponse.json({ error: (result as any).error }, { status: (result as any).status });

        // 🔄 TRIGGER MAINTENANCE: Let the central logic handle resolution, history, delay, etc.
        const updatedRoom = (result as any).updated;
        let maintenanceResult = updatedRoom;

        if ((result as any).shouldResolve) {
            console.log("[DiceRoll] 🏁 Round Full - Triggering Maintenance");
            maintenanceResult = await checkAndMaintenanceRoom(updatedRoom);
        }

        // Emit final state (Maintenance might have updated it again via emit, but safety first)
        const payload = await buildRoomPayload(prisma, id);
        if (payload) await emitRoomUpdate(id, payload);

        return NextResponse.json({ ok: true, roll: maintenanceResult.gameMeta });

    } catch (e: any) {
        console.error("Roll API error", e);
        return NextResponse.json({ error: e.message || "Unknown error" }, { status: 400 });
    }
}

