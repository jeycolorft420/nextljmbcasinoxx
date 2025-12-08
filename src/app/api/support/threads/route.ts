// src/app/api/support/threads/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lista SOLO para usuario autenticado (los hilos guest no se listan aquí)
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const threads = await prisma.supportThread.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(threads);
}

// Crear hilo: autenticado o invitado
const CreateBody = z.object({
  subject: z.string().min(2).max(120),
  firstMessage: z.string().min(1).max(2000),
  // para invitados:
  guestEmail: z.string().email().optional(),
  guestName: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  const { subject, firstMessage, guestEmail, guestName } = CreateBody.parse(
    await req.json()
  );

  // Caso autenticado
  if (userId) {
    const thread = await prisma.supportThread.create({
      data: {
        userId,
        subject,
        status: "open",
        messages: {
          create: {
            senderRole: "user",
            senderId: userId,
            content: firstMessage,
          },
        },
      },
      select: { id: true },
    });
    return NextResponse.json({ id: thread.id });
  }

  // Caso invitado (por ejemplo, desde /login -> “Olvidé mi clave”)
  if (!guestEmail) {
    return NextResponse.json(
      { error: "guestEmail es requerido para invitados" },
      { status: 400 }
    );
  }

  const thread = await prisma.supportThread.create({
    data: {
      subject,
      guestEmail,
      guestName: guestName || null,
      status: "open",
      messages: {
        create: {
          senderRole: "guest",
          senderId: null,
          content: firstMessage,
        },
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: thread.id });
}

