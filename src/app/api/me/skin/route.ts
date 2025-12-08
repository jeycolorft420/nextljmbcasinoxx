import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";

const Body = z.object({
    skin: z.string().min(1),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const email = session?.user?.email;
        if (!email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

        const json = await req.json().catch(() => ({}));
        const { skin } = Body.parse(json);

        // Verify ownership (optional but recommended)
        // For now, we assume if they send a skin ID/name, they own it or it's a default one.
        // In a stricter system, we'd check prisma.user.findUnique({ include: { rouletteSkins: true } })

        const updated = await prisma.user.update({
            where: { email },
            data: { selectedRouletteSkin: skin },
        });

        return NextResponse.json({ ok: true, skin: updated.selectedRouletteSkin });
    } catch (error) {
        console.error("Update skin error:", error);
        return NextResponse.json({ error: "Error al actualizar skin" }, { status: 500 });
    }
}
