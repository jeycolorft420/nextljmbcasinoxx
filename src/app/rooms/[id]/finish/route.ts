// src/app/api/rooms/[id]/finish/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import { emitRoomUpdate, emitRoomsIndex } from "@/lib/emit-rooms";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // Next 15: params puede venir como Promise
) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as "admin" | "user" | undefined;

    const { id } = await ctx.params;

    // Cargamos sala + entries
    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: { orderBy: { position: "asc" } } },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });

    const isRoulette = room.gameType === "ROULETTE";

    // Idempotencia: si ya está FINISHED, devolvemos ok y emitimos para sincronizar clientes
    if (room.state === "FINISHED") {
      await emitRoomUpdate(room.id);
      await emitRoomsIndex();
      return NextResponse.json({ ok: true, alreadyFinished: true });
    }

    // Reglas de acceso:
    // - Admin: siempre puede forzar
    // - Usuario normal: solo si es ruleta y la sala está llena/bloqueada lista para sorteo
    const isFull = room.entries.length === room.capacity;
    const isReadyByUser = isRoulette && (room.state === "LOCKED" || (room.state === "OPEN" && isFull));
    if (!(role === "admin" || role === "god" || isReadyByUser)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (!isFull) {
      return NextResponse.json({ error: "La sala no está completa" }, { status: 400 });
    }

    // Elegir ganador
    const winnerIndex = crypto.randomInt(0, room.entries.length);
    const winner = room.entries[winnerIndex];

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        state: "FINISHED",
        finishedAt: new Date(),
        winningEntryId: winner.id,           // ✅ variable correcta
        prizeCents: room.priceCents * 10,    // payout ruleta
        preselectedPosition: null,
      },
      include: { entries: { include: { user: true }, orderBy: { position: "asc" } } },
    });

    // Emitir realtime: detalle + índice
    await emitRoomUpdate(updated.id);
    await emitRoomsIndex();

    return NextResponse.json({ ok: true, room: updated, winner });
  } catch (e: any) {
    console.error("finish error:", e?.message || e);
    return NextResponse.json({ error: "Error al realizar el sorteo" }, { status: 500 });
  }
}
