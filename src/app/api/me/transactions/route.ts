import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            // Try to get id from email if id not in session root (depends on auth options)
            if (session?.user?.email) {
                const u = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
                if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
                // continue with u.id
                return fetchTransactions(u.id);
            }
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return fetchTransactions((session.user as any).id);

    } catch (error) {
        console.error("transactions error:", error);
        return NextResponse.json({ error: "Error fetching transactions" }, { status: 500 });
    }
}

async function fetchTransactions(userId: string) {
    const txs = await prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    return NextResponse.json(txs);
}
