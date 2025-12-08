// src/app/api/payments/nowpayments/ipn/route.ts
import { NextResponse } from "next/server";
import { TxKind } from "@prisma/client";
import { verifyIpnSignature } from "@/modules/users/lib/nowpayments";
import { emitPaymentFinished, emitWalletBalance } from "@/modules/ui/lib/realtime";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const sig = (req.headers.get("x-nowpayments-sig") || req.headers.get("x-nowpayments-signature")) ?? "";
    const ok = verifyIpnSignature(rawBody, sig);
    if (!ok) {
      console.error("IPN firma inválida");
      return NextResponse.json({ error: "bad signature" }, { status: 400 });
    }

    const body = JSON.parse(rawBody);
    const orderId: string | undefined = body?.order_id;
    const paymentStatus: string | undefined = body?.payment_status;

    if (!orderId) return NextResponse.json({ error: "order_id missing" }, { status: 400 });

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) return NextResponse.json({ error: "payment not found" }, { status: 404 });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: paymentStatus || "unknown", raw: body },
    });

    if (!payment.credited && (paymentStatus === "finished" || paymentStatus === "confirmed")) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: payment.userId },
          data: { balanceCents: { increment: payment.amountCents } },
        });
        await tx.transaction.create({
          data: {
            userId: payment.userId,
            amountCents: payment.amountCents,
            kind: TxKind.DEPOSIT,
            reason: "Depósito confirmado (NowPayments)",
            meta: { orderId },
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: { credited: true },
        });
      });

      // Emit realtime al usuario: pago y nuevo balance
      const u = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { balanceCents: true },
      });
      if (u) await emitWalletBalance(payment.userId, u.balanceCents);

      await emitPaymentFinished(payment.userId, {
        id: payment.id,
        amountCents: payment.amountCents,
        status: "finished",
        createdAt: payment.createdAt,
        orderId: payment.orderId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("IPN error:", e);
    return NextResponse.json({ error: "ipn error" }, { status: 500 });
  }
}


