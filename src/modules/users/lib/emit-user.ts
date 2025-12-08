// src/lib/emit-user.ts
import { pusherServer } from "@/modules/ui/lib/pusher-server";
import prisma from "@/modules/ui/lib/prisma";

function ch(userId: string) {
  return `private-user-${userId}`;
}

/** Saldo actualizado (y opcionalmente mini resumen) */
export async function emitUserWallet(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, balanceCents: true },
  });
  if (!u) return;
  await pusherServer.trigger(ch(userId), "user:wallet", {
    balanceCents: u.balanceCents,
  });
}

/** Nueva transferencia (solo al usuario afectado) */
export async function emitUserTransfer(
  userId: string,
  transfer: {
    id: string;
    amountCents: number;
    note?: string | null;
    createdAt: string;
    direction: "in" | "out";
    counterparty: string;
  }
) {
  await pusherServer.trigger(ch(userId), "user:transfer:new", transfer);
}

/** Cambio de estado de retiro */
export async function emitUserWithdrawalStatus(
  userId: string,
  payload: { id: string; status: "finished" | "rejected"; amountCents: number }
) {
  await pusherServer.trigger(ch(userId), "user:withdrawal:status", payload);
}

/** Pago confirmado/acreditado (NOWPayments) */
export async function emitUserPaymentFinished(
  userId: string,
  payload: { id: string; amountCents: number; orderId: string }
) {
  await pusherServer.trigger(ch(userId), "user:payment:finished", payload);
}

/** Métricas de referido (si cambian) */
export async function emitUserReferralUpdate(userId: string) {
  const [u, referralsCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralEarningsCents: true, referralCode: true, id: true },
    }),
    prisma.user.count({ where: { referredById: userId } }),
  ]);
  if (!u) return;
  await pusherServer.trigger(ch(userId), "user:referral:update", {
    referralsCount,
    referralEarningsCents: u.referralEarningsCents ?? 0,
  });
}

