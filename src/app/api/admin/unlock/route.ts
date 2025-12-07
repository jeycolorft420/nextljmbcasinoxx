
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { authenticator } from "otplib";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = session?.user as any;

        if (!user || user.role !== "god") {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const token = body.code;

        // Fetch full user to get the secret
        const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { twoFactorSecret: true, twoFactorEnabled: true }
        });

        if (!dbUser || !dbUser.twoFactorEnabled || !dbUser.twoFactorSecret) {
            return NextResponse.json({ error: "2FA no activado en perfil" }, { status: 403 });
        }

        // Verify TOTP
        try {
            const isValid = authenticator.verify({
                token,
                secret: dbUser.twoFactorSecret
            });

            if (!isValid) {
                return NextResponse.json({ error: "Código 2FA incorrecto" }, { status: 400 });
            }
        } catch (err) {
            return NextResponse.json({ error: "Error verificando código" }, { status: 400 });
        }

        // Set unlock cookie
        const cookieStore = await cookies();
        cookieStore.set("admin_unlocked", "true", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 4, // 4 hours
            path: "/"
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Unlock Error:", e);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
