// src/app/api/payments/reprocess-pending/route.ts
import { NextResponse } from "next/server";
import { TxKind } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin" && role !== "god") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Busca pagos finalizados/no acreditados
    const pending = await prisma.payment.findMany({
      where: {
        credited: false,
        status: { in: ["finished", "confirmed"] },
      },
      select: {
        id: true,
        userId: true,
        amountCents: true,
        orderId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, orderIds: [] });
    }

    const orderIds: string[] = [];
    let processed = 0;

    for (const pay of pending) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1) acreditar al usuario
          await tx.user.update({
            where: { id: pay.userId },
            data: { balanceCents: { increment: pay.amountCents } },
          });
          await tx.transaction.create({
            data: {
              userId: pay.userId,
              amountCents: pay.amountCents,
              kind: TxKind.DEPOSIT,
              reason: "Depósito confirmado (reproceso)",
              meta: { orderId: pay.orderId },
            },
          });

          // 2) bono 10% a referidor (si existe)
          const me = await tx.user.findUnique({
            where: { id: pay.userId },
            select: { referredById: true },
          });
          const bonus = Math.floor(pay.amountCents * 0.1);
          if (me?.referredById && bonus > 0) {
            await tx.user.update({
              where: { id: me.referredById },
              data: {
                balanceCents: { increment: bonus },
                referralEarningsCents: { increment: bonus },
                transactions: {
                  create: {
                    amountCents: bonus,
                    kind: TxKind.REFERRAL_BONUS,
                    reason: "Bono 10% por depósito de referido (reproceso)",
                    meta: { fromUserId: pay.userId, depositAmountCents: pay.amountCents, orderId: pay.orderId },
                  },
                },
              },
            });
          }

          // 3) marcar como acreditado
          await tx.payment.update({
            where: { id: pay.id },
            data: { credited: true },
          });
        });

        orderIds.push(pay.orderId);
        processed++;
      } catch (e) {
        console.error("reprocess item error:", pay.orderId, e);
        // continúa con el siguiente pago
      }
    }

    return NextResponse.json({ ok: true, processed, orderIds });
  } catch (e) {
    console.error("reprocess error:", e);
    return NextResponse.json({ error: "No se pudo reprocesar" }, { status: 500 });
  }
}
