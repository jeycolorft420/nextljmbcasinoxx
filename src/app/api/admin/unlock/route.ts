import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { authenticator } from "otplib";
import { cookies } from "next/headers";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Código requerido" }, { status: 400 });

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        // If user is admin but has NO 2FA enabled, should we allow?
        // The requirement is "security code to enter admin".
        // If they haven't set it up, they should go to profile first.
        return NextResponse.json({ error: "2FA no configurado. Ve a tu perfil." }, { status: 403 });
    }

    const isValid = authenticator.verify({
        token: code,
        secret: user.twoFactorSecret,
    });

    if (!isValid) {
        return NextResponse.json({ error: "Código inválido" }, { status: 400 });
    }

    // Set Cookie
    // Set Cookie
    (await cookies()).set("admin_unlocked", "true", {
        httpOnly: true,
        secure: process.env.NEXTAUTH_URL?.startsWith("https") ?? false,
        sameSite: "lax",
        maxAge: 60 * 60 * 4, // 4 hours
        path: "/",
    });

    return NextResponse.json({ success: true });
}
