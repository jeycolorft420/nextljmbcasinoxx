import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        const userId = (session?.user as any)?.id;

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const entries = await prisma.entry.findMany({
            where: { userId },
            take: 50,
            orderBy: { createdAt: "desc" },
            include: {
                room: {
                    select: {
                        id: true,
                        title: true,
                        gameType: true,
                        priceCents: true,
                        state: true,
                        winningEntryId: true,
                        prizeCents: true,
                        finishedAt: true,
                    },
                },
            },
        });

        // Transform to a cleaner format
        const history = entries.map((e) => {
            const isWinner = e.room.winningEntryId === e.id;
            let status = "PENDING";
            if (e.room.state === "FINISHED") {
                status = isWinner ? "WON" : "LOST";
            } else if (e.room.state === "LOCKED" || e.room.state === "DRAWING") {
                status = "PLAYING";
            }

            return {
                id: e.id,
                roomId: e.roomId,
                roomTitle: e.room.title,
                gameType: e.room.gameType,
                priceCents: e.room.priceCents,
                status,
                prizeCents: isWinner ? e.room.prizeCents : 0,
                createdAt: e.createdAt,
                position: e.position,
            };
        });

        return NextResponse.json(history);
    } catch (error) {
        console.error("Error fetching history:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
