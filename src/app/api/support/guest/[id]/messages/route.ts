// src/app/api/support/guest/[id]/messages/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // usamos POST para que el email vaya en el body (no en query)
  const { id } = Param.parse(await ctx.params);
  const { email } = (await req.json()) as { email?: string };

  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });

  const th = await prisma.supportThread.findUnique({
    where: { id },
    select: { guestEmail: true },
  });
  if (!th || !th.guestEmail || th.guestEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const messages = await prisma.supportMessage.findMany({
    where: { threadId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderRole: true, senderId: true, content: true, createdAt: true },
  });

  return NextResponse.json(messages);
}
