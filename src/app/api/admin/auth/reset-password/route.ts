// src/app/api/admin/auth/reset-password/create-link/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== "admin" && role !== "god") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { email } = Body.parse(await req.json());

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "No existe usuario con ese correo" }, { status: 404 });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutos

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: expires }
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${base}/reset-password?token=${token}`;

  // Se devuelve el link para copiarlo y pegarlo en el chat
  return NextResponse.json({ ok: true, url, expiresAt: expires });
}

