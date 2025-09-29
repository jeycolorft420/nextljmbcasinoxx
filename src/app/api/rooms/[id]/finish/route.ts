// src/app/api/rooms/[id]/finish/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletCredit } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const prisma = new PrismaClient();

const paramSchema = z.object({ id: z.string().min(1) });
const bodySchema = z
  .object({
    entryId: z.string().min(1).optional(),
    position: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Solo admin
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = paramSchema.parse(await params);
    const body = bodySchema.parse(await req.json().catch(() => undefined)) ?? {};

    // Carga sala con entradas y usuarios
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        entries: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });

    const isFull = room.entries.length >= room.capacity;

    // Si estaba OPEN y se llenó, primero bloquear
    if (room.state === "OPEN" && isFull) {
      await prisma.room.update({
        where: { id: room.id },
        data: { state: "LOCKED", lockedAt: new Date() },
      });
      room.state = "LOCKED";
    }

    // Solo permitimos finalizar si está LOCKED u OPEN (llenándose)
    if (room.state !== "LOCKED" && room.state !== "OPEN") {
      return NextResponse.json({ error: "La sala debe estar LOCKED/OPEN" }, { status: 400 });
    }

    if (room.entries.length === 0) {
      return NextResponse.json({ error: "No hay participantes" }, { status: 400 });
    }

    // Elegir ganador: entryId > position > preselectedPosition > aleatorio
    let winningEntry = null as (typeof room.entries)[number] | null;

    if (body.entryId) {
      winningEntry = room.entries.find((e) => e.id === body.entryId) ?? null;
      if (!winningEntry) {
        return NextResponse.json({ error: "entryId inválido" }, { status: 400 });
      }
    } else if (body.position) {
      winningEntry = room.entries.find((e) => e.position === body.position) ?? null;
      if (!winningEntry) {
        return NextResponse.json({ error: "position inválida" }, { status: 400 });
      }
    } else if (room.preselectedPosition) {
      winningEntry =
        room.entries.find((e) => e.position === room.preselectedPosition) ?? null;
      if (!winningEntry) {
        return NextResponse.json(
          { error: "La posición preseleccionada no está ocupada" },
          { status: 400 }
        );
      }
    } else {
      const idx = Math.floor(Math.random() * room.entries.length);
      winningEntry = room.entries[idx];
    }

    const prizeCents = room.priceCents * 10;

    // Marcar sala como FINISHED y limpiar preselección
    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        state: "FINISHED",
        finishedAt: new Date(),
        winningEntryId: winningEntry!.id,
        prizeCents,
        preselectedPosition: null, // limpiar preset
      },
      include: {
        entries: { include: { user: true }, orderBy: { position: "asc" } },
      },
    });

    const winner = updated.entries.find((e) => e.id === updated.winningEntryId);
    const winnerUser = winner?.user ?? null;
    const winnerPosition = winner?.position ?? null;
    const winnerName = winnerUser?.name ?? winnerUser?.email ?? null;

    // 💸 Acreditar premio al ganador
    if (winnerUser) {
      try {
        await walletCredit({
          userId: winnerUser.id,
          amountCents: prizeCents,
          reason: `Premio sala ${updated.title}`,
          kind: "WIN_CREDIT",
          meta: { roomId: updated.id, entryId: winner!.id },
        });
      } catch (e) {
        // si falla el crédito, ya la sala quedó finalizada; logeamos para revisar
        console.error("walletCredit (finish) error:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      roomId: updated.id,
      prizeCents: updated.prizeCents,
      winningEntryId: updated.winningEntryId,

      // NUEVO: ganador con forma estable para el frontend
      winner: winnerUser
        ? {
            user: { id: winnerUser.id, name: winnerUser.name, email: winnerUser.email },
            position: winnerPosition,
          }
        : null,

      // Redundancia para compatibilidad hacia atrás
      winnerName,        // "Test User" o "correo@..."
      winnerPosition,    // número de puesto
    });
    
  } catch (e) {
    console.error("finish error:", e);
    return NextResponse.json({ error: "Error al realizar el sorteo" }, { status: 500 });
  }
}
