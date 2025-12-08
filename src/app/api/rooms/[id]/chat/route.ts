import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { pusherServer } from "@/modules/ui/lib/pusher-server";

// Schema validación
const Body = z.object({
    content: z.string().min(1).max(500),
});

const Param = z.object({ id: z.string().min(1) });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id: roomId } = Param.parse(await ctx.params);

        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const messages = await prisma.chatMessage.findMany({
            where: {
                roomId,
                createdAt: { gt: fiveHoursAgo }
            },
            orderBy: { createdAt: "asc" },
            take: 50,
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { id: true, name: true, email: true } }
            }
        });

        return NextResponse.json(messages);
    } catch (e) {
        return NextResponse.json({ error: "Error fetching messages" }, { status: 500 });
    }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "No autenticado" }, { status: 401 });
        }

        const { id: roomId } = Param.parse(await ctx.params);
        const body = Body.parse(await req.json().catch(() => ({})));

        // Rate limiting muy básico si quisieras, pero confiamos en el general por ahora.

        // Verificar que el usuario exista
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, name: true, email: true, role: true }
        });

        if (!user) return NextResponse.json({ error: "Usuario no existe" }, { status: 400 });

        // Guardar en DB
        const message = await prisma.chatMessage.create({
            data: {
                roomId,
                userId: user.id,
                content: body.content.trim(),
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { id: true, name: true, email: true } } // enviar info minima
            }
        });

        // Cleanup: Borrar mensajes de esta sala > 5 horas
        // "mientras que quede ahí" -> Política de retención simple sin cronjobs.
        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
        // No esperamos (fire and forget) o catch para no bloquear
        prisma.chatMessage.deleteMany({
            where: {
                roomId,
                createdAt: { lt: fiveHoursAgo }
            }
        }).catch(err => console.error("Chat cleanup error:", err));

        // Emitir socket
        await pusherServer.trigger(`private-room-${roomId}`, "chat:message", message);

        return NextResponse.json(message);

    } catch (e: any) {
        console.error("Chat POST error:", e);
        return NextResponse.json({ error: e?.message || "Error al enviar mensaje" }, { status: 500 });
    }
}

