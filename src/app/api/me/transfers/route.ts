// src/app/api/me/transfers/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const items = await prisma.transfer.findMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      fromUser: { select: { email: true, name: true, id: true } },
      toUser: { select: { email: true, name: true, id: true } },
    },
  });

  const mapped = items.map((t) => ({
    id: t.id,
    amountCents: t.amountCents,
    note: t.note,
    createdAt: t.createdAt,
    direction: t.fromUserId === userId ? "out" : "in",
    counterparty:
      t.fromUserId === userId
        ? (t.toUser.name || t.toUser.email)
        : (t.fromUser.name || t.fromUser.email),
  }));

  return NextResponse.json(mapped);
}

