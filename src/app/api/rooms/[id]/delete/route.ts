// src/app/api/rooms/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emitRoomsIndex } from "@/lib/emit-rooms";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
const Params = z.object({ id: z.string().min(1) });

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin" && role !== "god") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = Params.parse(await ctx.params);

    const room = await prisma.room.findUnique({
      where: { id },
      select: { id: true, state: true, deletedAt: true, _count: { select: { entries: true } } },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    if (room.deletedAt) return NextResponse.json({ ok: true, alreadyDeleted: true });

    if (room.state === "LOCKED" && room._count.entries > 0) {
      return NextResponse.json(
        { error: "Sala LOCKED con participantes. Ejecuta 'Reset' antes de eliminar." },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.entry.deleteMany({ where: { roomId: id } });
      await tx.room.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    // 👇 realtime índice global
    await emitRoomsIndex();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/rooms/[id]/delete", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
