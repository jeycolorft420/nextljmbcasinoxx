// src/app/api/wallet/transfer/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletTransferByEmail } from "@/lib/wallet";
import {
  emitTransferEvent,
  emitWalletBalance,
} from "@/lib/realtime";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  toEmail: z.string().email(),
  amountCents: z.number().int().positive().min(100), // mínimo $1
  note: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const fromUserId = (session?.user as any)?.id as string | undefined;
  const fromEmail = session?.user?.email as string | undefined;
  if (!fromUserId || !fromEmail) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { toEmail, amountCents, note } = Body.parse(await req.json());
  if (toEmail.toLowerCase() === fromEmail.toLowerCase()) {
    return NextResponse.json({ error: "No puedes transferirte a ti mismo" }, { status: 400 });
  }

  try {
    const t = await walletTransferByEmail({
      fromUserId,
      toEmail,
      amountCents,
      note,
    });

    // Traemos info para payloads + balances
    const tr = await prisma.transfer.findUnique({
      where: { id: t.id },
      include: {
        fromUser: { select: { id: true, name: true, email: true, balanceCents: true } },
        toUser: { select: { id: true, name: true, email: true, balanceCents: true } },
      },
    });
    if (tr) {
      // Emisor
      await emitTransferEvent(tr.fromUserId, {
        id: tr.id,
        amountCents: tr.amountCents,
        note: tr.note,
        createdAt: tr.createdAt,
        direction: "out",
        counterparty: tr.toUser.name || tr.toUser.email,
      });
      await emitWalletBalance(tr.fromUserId, tr.fromUser.balanceCents);

      // Receptor
      await emitTransferEvent(tr.toUserId, {
        id: tr.id,
        amountCents: tr.amountCents,
        note: tr.note,
        createdAt: tr.createdAt,
        direction: "in",
        counterparty: tr.fromUser.name || tr.fromUser.email,
      });
      await emitWalletBalance(tr.toUserId, tr.toUser.balanceCents);
    }

    return NextResponse.json({ ok: true, id: t.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo transferir" }, { status: 400 });
  }
}
