// src/app/api/admin/support/threads/[id]/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });
const Body = z.object({ status: z.enum(["open", "closed"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== "admin" && role !== "god") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = Param.parse(await ctx.params);
  const { status } = Body.parse(await req.json());

  const th = await prisma.supportThread.findUnique({ where: { id }, select: { id: true } });
  if (!th) return NextResponse.json({ error: "No existe" }, { status: 404 });

  await prisma.supportThread.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}

