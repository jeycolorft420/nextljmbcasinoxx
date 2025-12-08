import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { prisma } from "@/modules/ui/lib/prisma";

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { avatarUrl } = await req.json();

        if (!avatarUrl) {
            return NextResponse.json({ error: "Avatar URL is required" }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { email: session.user.email },
            data: { avatarUrl },
        });

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Error updating avatar:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

