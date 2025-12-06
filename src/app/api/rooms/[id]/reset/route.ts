// src/app/api/rooms/[id]/reset/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletCredit } from "@/lib/wallet";
import { emitRoomsIndex, emitRoomUpdate } from "@/lib/emit-rooms";
import prisma from "@/lib/prisma";
const paramSchema = z.object({ id: z.string().min(1) });

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    // Permisos: Admin siempre, o Usuario si la sala está FINISHED hace > 8 seg
    const isAdmin = role === "admin" || role === "god";

    const { id } = paramSchema.parse(await params);

    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!room) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }

    if (!isAdmin) {
      if (room.state !== "FINISHED" || !room.finishedAt) {
        return NextResponse.json({ error: "Solo admin puede resetear sala activa" }, { status: 403 });
      }
      const diff = new Date().getTime() - new Date(room.finishedAt).getTime();
      // Aumentado a 20s para garantizar que se ve el ganador (spin 4s + reveal 15s + buffer)
      if (diff < 20000) {
        return NextResponse.json({ error: "Espera a que termine la animación" }, { status: 400 });
      }
    }

    // Si admin resetea forzado una sala NO finalized (ej OPEN/LOCKED), reembolsamos
    if (isAdmin && room.state !== "FINISHED") {
      for (const entry of room.entries) {
        // Solo reembolsar entries de la ronda actual si vamos a "borrarlas"
        // Al incrementar ronda, las viejas entries quedan huérfanas de contexto visual,
        // pero el dinero ya fue debitado.
        // Si el admin resetea "a la fuerza" una sala trabada, debería reembolsar.
        if (entry.round === ((room as any).currentRound ?? 1)) {
          try {
            await walletCredit({
              userId: entry.userId,
              amountCents: room.priceCents,
              reason: `Reembolso sala ${room.title} (Admin Reset)`,
              kind: "REFUND",
              meta: { roomId: room.id, entryId: entry.id },
            });
          } catch (e) {
            console.error("refund error:", e);
          }
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Usamos updateMany para garantizar atomicidad en condicional "state=FINISHED"
      // De esta forma si 2 requests entran a la vez, solo 1 actualizará.
      const op = await tx.room.updateMany({
        where: { id, state: "FINISHED" },
        data: {
          state: "OPEN",
          lockedAt: null,
          finishedAt: null,
          rolledAt: null,
          winningEntryId: null,
          prizeCents: null,
          preselectedPosition: null,
          gameMeta: {},
          currentRound: { increment: 1 },
        }
      });
      return op.count;
    });

    // Si era FINISHED pero no se actualizó, es race condition o ya cambiado
    // Pero si room.state (leido antes) era FINISHED, significa que alguien ganó la carrera.
    // Simplemente retornamos ok, ya que el objetivo (reset) se cumplió.
    if (result === 0 && room.state === "FINISHED") {
      return NextResponse.json({ ok: true, note: "Already processed" });
    }

    // Si no era finished (admin force), y no lo tocamos via updateMany (porque el where falló)
    // necesitamos hacerlo forzado si admin.
    if (isAdmin && room.state !== "FINISHED") {
      await prisma.room.update({
        where: { id },
        data: {
          state: "OPEN",
          lockedAt: null,
          finishedAt: null,
          rolledAt: null,
          winningEntryId: null,
          prizeCents: null,
          preselectedPosition: null,
          gameMeta: {},
          currentRound: { increment: 1 },
        }
      });
    }

    // 👇 realtime: índice y detalle
    await emitRoomsIndex();
    await emitRoomUpdate(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("reset error:", e);
    return NextResponse.json({ error: "No se pudo resetear" }, { status: 500 });
  }
}
