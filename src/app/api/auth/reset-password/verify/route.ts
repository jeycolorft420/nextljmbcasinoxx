// src/app/api/auth/reset-password/verify/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  const { token } = Body.parse(await req.json());
  const t = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { email: true } } }
  });
  if (!t) return NextResponse.json({ valid: false, reason: "invalid" });
  if (t.usedAt) return NextResponse.json({ valid: false, reason: "used" });
  if (t.expiresAt < new Date()) return NextResponse.json({ valid: false, reason: "expired" });

  return NextResponse.json({ valid: true, email: t.user.email });
}
