// src/app/api/admin/auth/reset/create-link/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Body = z.object({
  email: z.string().email(),
  // (opcional) minutos de validez; por defecto 60
  ttlMinutes: z.number().int().positive().max(24 * 60).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== "admin" && role !== "god") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { email, ttlMinutes = 60 } = Body.parse(await req.json());

  // Buscar usuario
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "No existe un usuario con ese correo" }, { status: 404 });
  }

  // Invalidar tokens anteriores sin usar (opcional pero prolijo)
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
  });

  // Crear token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  // Base pública para armar el link
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";

  const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ url, expiresAt });
}
