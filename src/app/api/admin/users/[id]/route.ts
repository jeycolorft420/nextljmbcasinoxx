
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as any)?.role;

        if (role !== "god") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id } = await params;

        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                // Wallet & Transactions
                transactions: {
                    take: 20,
                    orderBy: { createdAt: 'desc' }
                },
                // Game History (Entries + Result)
                entries: {
                    take: 20,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        room: true
                    }
                },
                // Financials
                payments: {
                    take: 10,
                    orderBy: { createdAt: 'desc' }
                },
                withdrawals: {
                    take: 10,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Calculate aggregate stats
        const aggregates = await prisma.transaction.groupBy({
            by: ['kind'],
            where: { userId: id },
            _sum: { amountCents: true }
        });

        // Parse aggregates into easier format
        const stats = {
            totalDeposited: 0,
            totalWithdrawn: 0,
            totalWagered: 0,
            totalWon: 0
        };

        aggregates.forEach(agg => {
            const amount = agg._sum.amountCents || 0;
            if (agg.kind === 'DEPOSIT') stats.totalDeposited += amount;
            if (agg.kind === 'WITHDRAW') stats.totalWithdrawn += amount;
            if (agg.kind === 'JOIN_DEBIT') stats.totalWagered += amount; // This is negative usually? No, amount is absolute usually depending on implementation. Assuming positive magnitude.
            if (agg.kind === 'WIN_CREDIT') stats.totalWon += amount;
        });

        return NextResponse.json({ user, stats });

    } catch (error) {
        console.error("User Detail Error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as any)?.role;

        if (role !== "god") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id } = await params;
        const body = await req.json();

        // Allowed fields to update directly
        const { role: newRole, fullName, documentId, email, username, twoFactorEnabled } = body;

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                role: newRole,
                fullName,
                documentId,
                email,
                username,
                twoFactorEnabled
            }
        });

        return NextResponse.json({ success: true, user: updatedUser });

    } catch (error) {
        return NextResponse.json({ error: "Update Failed" }, { status: 500 });
    }
}
