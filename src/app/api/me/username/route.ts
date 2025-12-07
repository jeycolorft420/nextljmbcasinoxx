import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { username } = await req.json();

        // 1. Validation Logic
        if (!username) return NextResponse.json({ error: "Username requerido" }, { status: 400 });

        const cleanUsername = username.toLowerCase().trim();

        if (cleanUsername.length > 15) {
            return NextResponse.json({ error: "Máximo 15 caracteres" }, { status: 400 });
        }

        // Regex: Only a-z and 0-9
        const regex = /^[a-z0-9]+$/;
        if (!regex.test(cleanUsername)) {
            return NextResponse.json({ error: "Solo letras minúsculas y números (sin espacios ni símbolos)" }, { status: 400 });
        }

        // 2. Check availability
        const existing = await prisma.user.findUnique({
            where: { username: cleanUsername }
        });

        if (existing) {
            return NextResponse.json({ error: "Este usuario ya está en uso" }, { status: 409 });
        }

        // 3. Update
        const updated = await prisma.user.update({
            where: { email: session.user.email },
            data: { username: cleanUsername }
        });

        return NextResponse.json({ success: true, username: updated.username });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
