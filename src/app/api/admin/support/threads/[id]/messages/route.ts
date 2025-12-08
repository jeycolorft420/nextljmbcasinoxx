// src/app/api/admin/support/threads/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = Param.parse(await ctx.params);

  const thread = await prisma.supportThread.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!thread) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const messages = await prisma.supportMessage.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderRole: true,
      senderId: true,
      content: true,
      createdAt: true,
    },
  });

  return NextResponse.json(messages);
}

