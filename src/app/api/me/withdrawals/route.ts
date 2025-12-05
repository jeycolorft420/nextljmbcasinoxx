// src/app/api/me/withdrawals/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { emitAdminWithdrawalCreated, emitUserWithdrawalUpdated } from "@/lib/realtime-withdrawals";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const list = await prisma.withdrawal.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(list);
  } catch (e) {
    console.error("me/withdrawals GET error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { amountCents, wallet } = await req.json();
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 });
    }
    if (amountCents < 1000) {
      return NextResponse.json({ error: "El mínimo de retiro es $10" }, { status: 400 });
    }
    if (!wallet || typeof wallet !== "string" || wallet.length < 8) {
      return NextResponse.json({ error: "Wallet inválida" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, balanceCents: true, email: true, name: true },
    });
    if (!me) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (me.balanceCents < amountCents) {
      return NextResponse.json({ error: "Saldo insuficiente" }, { status: 400 });
    }

    const [_, w, __] = await prisma.$transaction([
      prisma.user.update({
        where: { id: me.id },
        data: { balanceCents: { decrement: amountCents } },
      }),
      prisma.withdrawal.create({
        data: { userId: me.id, amountCents, wallet, status: "pending" },
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.transaction.create({
        data: {
          userId: me.id,
          amountCents: -amountCents,
          kind: "WITHDRAW",
          reason: "Solicitud de retiro",
          meta: { wallet },
        },
      }),
    ]);

    // 🔔 Notificar al panel admin (aparece al instante)
    await emitAdminWithdrawalCreated({
      id: w.id,
      user: { email: w.user.email, name: w.user.name },
      amountCents: w.amountCents,
      wallet: w.wallet,
      status: w.status as any,
      createdAt: w.createdAt.toISOString(),
    });

    // (Opcional) notificar al usuario en su canal privado
    await emitUserWithdrawalUpdated(me.id, { id: w.id, status: "pending" });

    return NextResponse.json({ ok: true, id: w.id });
  } catch (e) {
    console.error("me/withdrawals POST error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
