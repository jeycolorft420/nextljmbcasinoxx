import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Adjust path if needed
import prisma from "@/lib/prisma";
import { authenticator } from "otplib";
import qrcode from "qrcode";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Generate Secret
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, "RuletaAdmin", secret);

    // Generate QR
    const qrImageUrl = await qrcode.toDataURL(otpauth);

    // Save secret temporarily (or permanently but disabled)
    await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: secret },
    });

    return NextResponse.json({ secret, qrImageUrl });
}

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await req.json();

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    if (!user || !user.twoFactorSecret) {
        return NextResponse.json({ error: "Setup not initialized" }, { status: 400 });
    }

    const isValid = authenticator.verify({
        token,
        secret: user.twoFactorSecret,
    });

    if (!isValid) {
        return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Enable 2FA
    await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true },
    });

    return NextResponse.json({ success: true });
}
