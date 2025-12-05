// src/app/api/auth/reset-password/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";                // <-- AQUI
import prisma from "@/lib/prisma";
const Body = z.object({ token: z.string().min(1), newPassword: z.string().min(6) });

export async function POST(req: Request) {
  const { token, newPassword } = Body.parse(await req.json());

  const t = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!t) return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  if (t.usedAt) return NextResponse.json({ error: "Token usado" }, { status: 400 });
  if (t.expiresAt < new Date()) return NextResponse.json({ error: "Token expirado" }, { status: 400 });

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.userId }, data: { password: hash } }),
    prisma.passwordResetToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
