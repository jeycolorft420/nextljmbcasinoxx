// src/app/api/referral/my/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const prisma = new PrismaClient();

function makeCode(len = 7) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I/O/0/1
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    // Trae balance + referralCode real de BD
    let me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, balanceCents: true, referralCode: true },
    });
    if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

    // Si no tiene código, lo generamos ÚNICO y lo guardamos
    if (!me.referralCode) {
      while (true) {
        const code = makeCode(7);
        const clash = await prisma.user.findFirst({ where: { referralCode: code } });
        if (!clash) {
          me = await prisma.user.update({
            where: { id: userId },
            data: { referralCode: code },
            select: { id: true, balanceCents: true, referralCode: true },
          });
          break;
        }
      }
    }

    // (opcional) conteo de referidos
    const referralsCount = await prisma.user.count({ where: { referredById: userId } });

    const base =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXTAUTH_URL ??
      "http://localhost:3000";

    return NextResponse.json({
      balanceCents: me.balanceCents,
      referralCode: me.referralCode!,
      referralUrl: `${base}/register?ref=${encodeURIComponent(me.referralCode!)}`,
      referralsCount,
      referralEarningsCents: 0, // por ahora 0; se calculará cuando implementes bonus
    });
  } catch (e) {
    console.error("referral/my error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
