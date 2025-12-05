// src/app/api/support/guest/[id]/reply/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });
const Body = z.object({ email: z.string().email(), content: z.string().min(1).max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = Param.parse(await ctx.params);
  const { email, content } = Body.parse(await req.json());

  const th = await prisma.supportThread.findUnique({
    where: { id },
    select: { guestEmail: true, status: true },
  });
  if (!th || !th.guestEmail || th.guestEmail.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (th.status === "closed") {
    return NextResponse.json({ error: "Hilo cerrado" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { threadId: id, senderRole: "guest", senderId: null, content },
    }),
    prisma.supportThread.update({
      where: { id },
      data: { lastMessageAt: new Date(), updatedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
