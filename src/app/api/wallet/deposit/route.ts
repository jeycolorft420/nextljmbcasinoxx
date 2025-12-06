// src/app/api/wallet/deposit/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletCredit } from "@/lib/wallet";
import prisma from "@/lib/prisma";

const schema = z.object({
  userId: z.string().min(1),
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).default("Depósito administrativo"),
  meta: z.any().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "god") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { userId, amountCents, reason, meta } = schema.parse(await req.json());

  // 1) Acreditar al usuario
  await walletCredit({ userId, amountCents, reason, kind: "DEPOSIT", meta });

  // 2) Si tiene referidor, acreditar 10%
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });

  if (u?.referredById) {
    const bonus = Math.floor(amountCents * 0.10);
    if (bonus > 0) {
      await walletCredit({
        userId: u.referredById,
        amountCents: bonus,
        reason: `Bono de referido (10%) por depósito de ${userId}`,
        kind: "REFERRAL_BONUS",
        meta: { sourceUserId: userId, amountCents },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
