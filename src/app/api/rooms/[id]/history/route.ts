import { NextResponse } from "next/server";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;

        const history = await prisma.gameResult.findMany({
            where: { roomId: id },
            orderBy: { createdAt: "desc" },
            take: 20,
        });

        return NextResponse.json(history);
    } catch (error) {
        console.error("history error:", error);
        return NextResponse.json({ error: "Error fetching history" }, { status: 500 });
    }
}

