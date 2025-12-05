// src/app/api/me/payments/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Solo recargas exitosas
  const items = await prisma.payment.findMany({
    where: { userId, status: "finished" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      status: true,
      createdAt: true,
      npPaymentId: true,
      orderId: true,
    },
    take: 50,
  });

  return NextResponse.json(items);
}
