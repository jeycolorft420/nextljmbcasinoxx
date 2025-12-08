import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";

const Body = z.object({
    skin: z.string().min(1),
    type: z.enum(["roulette", "dice"]).optional().default("roulette"),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const email = session?.user?.email;
        if (!email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

        const json = await req.json().catch(() => ({}));
        const { skin, type } = Body.parse(json);

        // Update based on type
        const data = type === "dice"
            ? { selectedDiceColor: skin }
            : { selectedRouletteSkin: skin };

        const updated = await prisma.user.update({
            where: { email },
            data,
        });

        return NextResponse.json({ ok: true, skin, type });
    } catch (error) {
        console.error("Update skin error:", error);
        return NextResponse.json({ error: "Error al actualizar skin" }, { status: 500 });
    }
}
