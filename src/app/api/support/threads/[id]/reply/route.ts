// src/app/api/support/threads/[id]/reply/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });
const Body = z.object({ content: z.string().min(1).max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = Param.parse(await ctx.params);
  const { content } = Body.parse(await req.json());

  // Validar que el hilo pertenezca al usuario
  const th = await prisma.supportThread.findUnique({ where: { id }, select: { userId: true, status: true }});
  if (!th) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (th.userId !== userId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (th.status === "closed") return NextResponse.json({ error: "Hilo cerrado" }, { status: 400 });

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { threadId: id, senderRole: "user", senderId: userId, content }
    }),
    prisma.supportThread.update({
      where: { id },
      data: { lastMessageAt: new Date(), updatedAt: new Date() }
    })
  ]);

  return NextResponse.json({ ok: true });
}
