// src/app/api/admin/withdrawals/[id]/mark/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { emitAdminWithdrawalChanged, emitUserWithdrawalUpdated } from "@/lib/realtime-withdrawals";
import prisma from "@/lib/prisma";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const Body = z.object({ status: z.enum(["finished", "rejected"]) });

  try {
    const { status } = Body.parse(await req.json());

    const w = await prisma.withdrawal.update({
      where: { id },
      data: { status },
      select: { id: true, status: true, userId: true },
    });

    // 🔔 Notificar al panel admin y al usuario
    await emitAdminWithdrawalChanged({ id: w.id, status: w.status as any });
    await emitUserWithdrawalUpdated(w.userId, { id: w.id, status: w.status as any });

    return NextResponse.json({ ok: true, id: w.id, status: w.status });
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 });
    }
    if (err?.issues) {
      return NextResponse.json({ error: "Body inválido", issues: err.issues }, { status: 400 });
    }
    console.error("mark withdrawal error:", err);
    return NextResponse.json({ error: "Error al actualizar retiro" }, { status: 500 });
  }
}
