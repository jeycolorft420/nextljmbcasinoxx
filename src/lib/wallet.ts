// src/lib/wallet.ts
import { TxKind } from "@prisma/client";
import prisma from "@/lib/prisma";

/** Debita saldo (error si no alcanza) y registra la transacción. */
export async function walletDebit(opts: {
  userId: string;
  amountCents: number; // positivo
  reason: string;
  kind: "JOIN_DEBIT" | "WITHDRAW" | "TRANSFER_OUT";
  meta?: any;
}) {
  const { userId, amountCents, reason, kind, meta } = opts;
  if (amountCents <= 0) throw new Error("amountCents debe ser > 0");

  const userCheck = await prisma.user.findUnique({ where: { id: userId }, select: { verificationStatus: true } });
  if (userCheck?.verificationStatus !== "APPROVED") {
    throw new Error("KYC Requerido: Debes verificar tu identidad para jugar.");
  }

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
  kind: "DEPOSIT" | "WIN_CREDIT" | "REFUND" | "REFERRAL_BONUS" | "TRANSFER_IN";
  meta?: any;
}) {
  const { userId, amountCents, reason, kind, meta } = opts;
  if (amountCents <= 0) throw new Error("amountCents debe ser > 0");

  const userCheck = await prisma.user.findUnique({ where: { id: userId }, select: { verificationStatus: true } });
  if (userCheck?.verificationStatus !== "APPROVED") {
    throw new Error("KYC Requerido: Debes verificar tu identidad para jugar.");
  }

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

/** Transferencia por correo (de remitente a destinatario). */
export async function walletTransferByEmail(opts: {
  fromUserId: string;
  toEmail: string;
  amountCents: number;
  note?: string;
}) {
  const { fromUserId, toEmail, amountCents, note } = opts;
  if (amountCents <= 0) throw new Error("Monto inválido");
  const to = await prisma.user.findUnique({
    where: { email: toEmail.toLowerCase() },
    select: { id: true, email: true, name: true },
  });
  if (!to) throw new Error("El destinatario no existe");
  if (to.id === fromUserId) throw new Error("No puedes transferirte a ti mismo");

  return prisma.$transaction(async (tx) => {
    // Debitar remitente
    const fromUser = await tx.user.findUnique({
      where: { id: fromUserId },
      select: { id: true, balanceCents: true, email: true, name: true },
    });
    if (!fromUser) throw new Error("Usuario remitente no existe");
    if (fromUser.balanceCents < amountCents) throw new Error("Saldo insuficiente");

    await tx.user.update({
      where: { id: fromUserId },
      data: { balanceCents: { decrement: amountCents } },
    });
    await tx.transaction.create({
      data: {
        userId: fromUserId,
        amountCents: -amountCents,
        kind: TxKind.TRANSFER_OUT,
        reason: `Transferencia a ${to.email}`,
        meta: { toEmail: to.email, note },
      },
    });

    // Acreditar destinatario
    await tx.user.update({
      where: { id: to.id },
      data: { balanceCents: { increment: amountCents } },
    });
    await tx.transaction.create({
      data: {
        userId: to.id,
        amountCents: amountCents,
        kind: TxKind.TRANSFER_IN,
        reason: `Transferencia de ${fromUser.email}`,
        meta: { fromEmail: fromUser.email, note },
      },
    });

    // Registrar Transfer
    const transfer = await tx.transfer.create({
      data: {
        fromUserId,
        toUserId: to.id,
        amountCents,
        note: note ?? null,
      },
      include: {
        fromUser: { select: { email: true, name: true, id: true } },
        toUser: { select: { email: true, name: true, id: true } },
      },
    });

    return transfer;
  });
}
