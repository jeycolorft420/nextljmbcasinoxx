// src/app/api/support/threads/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = Param.parse(await ctx.params);

  // Seguridad: user solo puede ver sus hilos, admin puede ver any
  const thread = await prisma.supportThread.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!thread) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (role !== "admin" && thread.userId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const messages = await prisma.supportMessage.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderRole: true, senderId: true, content: true, createdAt: true },
  });

  return NextResponse.json(messages);
}

