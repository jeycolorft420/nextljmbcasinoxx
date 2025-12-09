import { NextResponse } from "next/server";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const room = await prisma.room.findUnique({
            where: { id },
            include: { entries: { include: { user: true } } }
        });

        if (!room) return NextResponse.json({ error: "No room" });

        // Manual Maintenance Trigger Check
        const p1 = room.entries.find(e => e.position === 1);
        const p2 = room.entries.find(e => e.position === 2);

        return NextResponse.json({
            id: room.id,
            state: room.state,
            currentRound: room.currentRound,
            gameMeta: room.gameMeta,
            p1: p1 ? { id: p1.userId, isBot: p1.user.isBot, name: p1.user.name } : null,
            p2: p2 ? { id: p2.userId, isBot: p2.user.isBot, name: p2.user.name } : null,
            autoLockAt: room.autoLockAt,
            now: new Date()
        });
    } catch (e) {
        return NextResponse.json({ error: String(e) });
    }
}
