// src/app/api/support/messages/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ListQuery = z.object({ threadId: z.string().min(1) });
const CreateBody = z.object({
  threadId: z.string().min(1),
  content: z.string().min(1),
  // solo invitados:
  asGuest: z.boolean().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const { threadId } = ListQuery.parse({ threadId: searchParams.get("threadId") });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  const thread = await prisma.supportThread.findUnique({ where: { id: threadId } });
  if (!thread) return NextResponse.json({ error: "No existe" }, { status: 404 });

  // reglas de acceso
  if (!userId) {
    // invitados: solo a hilos guest
    if (!thread.userId) {
      const msgs = await prisma.supportMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json(msgs);
    }
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  } else {
    // usuario autenticado: solo sus hilos
    if (thread.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const msgs = await prisma.supportMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(msgs);
  }
}

export async function POST(req: Request) {
  const body = CreateBody.parse(await req.json());
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  const thread = await prisma.supportThread.findUnique({ where: { id: body.threadId } });
  if (!thread) return NextResponse.json({ error: "No existe" }, { status: 404 });

  // Invitado: solo si el hilo es de invitado
  if (!userId) {
    if (!thread.userId) {
      const m = await prisma.supportMessage.create({
        data: { threadId: body.threadId, senderRole: "guest", content: body.content },
      });
      await prisma.supportThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });
      return NextResponse.json(m);
    }
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Usuario autenticado: solo su hilo
  if (thread.userId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const m = await prisma.supportMessage.create({
    data: { threadId: body.threadId, senderRole: "user", content: body.content },
  });
  await prisma.supportThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });
  return NextResponse.json(m);
}
