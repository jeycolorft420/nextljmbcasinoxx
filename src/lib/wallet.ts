// src/lib/wallet.ts
import { PrismaClient, TxKind } from "@prisma/client";

const prisma = new PrismaClient();

/** Debita saldo (error si no alcanza) y registra la transacción. */
export async function walletDebit(opts: {
  userId: string;
  amountCents: number; // positivo
  reason: string;
  kind: "JOIN_DEBIT" | "WITHDRAW";
  meta?: any;
}) {
  const { userId, amountCents, reason, kind, meta } = opts;
  if (amountCents <= 0) throw new Error("amountCents debe ser > 0");

  return await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { balanceCents: true } });
    if (!u) throw new Error("Usuario no encontrado");
    if (u.balanceCents < amountCents) throw new Error("Saldo insuficiente");

    const updated = await tx.user.update({
      where: { id: userId },
      data: { balanceCents: { decrement: amountCents } },
    });

    await tx.transaction.create({
      data: {
        userId,
        amountCents: -amountCents,
        kind: kind as any,
        reason,
        meta,
      },
    });

    return updated;
  });
}

/** Acredita saldo y registra la transacción. */
export async function walletCredit(opts: {
  userId: string;
  amountCents: number; // positivo
  reason: string;
  kind: "DEPOSIT" | "WIN_CREDIT" | "REFUND" | "REFERRAL_BONUS";
  meta?: any;
}) {
  const { userId, amountCents, reason, kind, meta } = opts;
  if (amountCents <= 0) throw new Error("amountCents debe ser > 0");

  return await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new Error("Usuario no encontrado");

    const updated = await tx.user.update({
      where: { id: userId },
      data: { balanceCents: { increment: amountCents } },
    });

    await tx.transaction.create({
      data: {
        userId,
        amountCents,
        kind: kind as any,
        reason,
        meta,
      },
    });

    return updated;
  });
}

/** Depósito (prueba). Si el usuario fue referido, bonifica 10% al referidor. */
export async function walletDeposit(userId: string, amountCents: number) {
  if (amountCents <= 0) throw new Error("Monto inválido");
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referredById: true },
  });
  if (!me) throw new Error("Usuario no encontrado");

  // Crédito al usuario
  await walletCredit({
    userId,
    amountCents,
    kind: "DEPOSIT",
    reason: "Depósito (prueba)",
  });

  // Bono 10% al referidor (si aplica)
  if (me.referredById) {
    const bonus = Math.floor(amountCents * 0.1);
    if (bonus > 0) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: me.referredById },
          data: {
            balanceCents: { increment: bonus },
            referralEarningsCents: { increment: bonus },
            transactions: {
              create: {
                amountCents: bonus,
                kind: TxKind.REFERRAL_BONUS,
                reason: "Bono 10% por depósito de referido",
                meta: { fromUserId: userId, depositAmountCents: amountCents },
              },
            },
          },
        }),
      ]);
    }
  }

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, balanceCents: true },
  });
}
