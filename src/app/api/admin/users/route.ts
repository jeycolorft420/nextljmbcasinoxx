
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as any)?.role;

        if (role !== "god") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = 20;
        const skip = (page - 1) * limit;

        // Stats Logic (Only on first page load or separate endpoint? Let's do it here for simplicity)
        const [totalUsers, totalBots, totalBalance] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isBot: true } }),
            prisma.user.aggregate({ _sum: { balanceCents: true } })
        ]);

        // Search Filter
        const whereClause = q ? {
            OR: [
                { email: { contains: q, mode: 'insensitive' as const } },
                { fullName: { contains: q, mode: 'insensitive' as const } },
                { documentId: { contains: q } },
                { username: { contains: q, mode: 'insensitive' as const } },
                { id: { contains: q } } // Search by ID too
            ]
        } : {};

        const users = await prisma.user.findMany({
            where: whereClause,
            take: limit,
            skip: skip,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                username: true,
                fullName: true,
                role: true,
                balanceCents: true,
                verificationStatus: true,
                isBot: true,
                profilePhotoUrl: true,
                createdAt: true,
                documentId: true // Useful for list view
            }
        });

        return NextResponse.json({
            users,
            stats: {
                totalUsers,
                totalBots,
                totalBalance: totalBalance._sum.balanceCents || 0
            },
            pagination: {
                page,
                limit,
                hasMore: users.length === limit
            }
        });

    } catch (error) {
        console.error("Admin Users Error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
