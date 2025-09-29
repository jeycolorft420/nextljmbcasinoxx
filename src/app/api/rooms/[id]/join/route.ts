// src/app/api/rooms/[id]/join/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletDebit, walletCredit } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const prisma = new PrismaClient();
const paramSchema = z.object({ id: z.string().min(1) });

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = paramSchema.parse(await params);

    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }
    if (room.state !== "OPEN") {
      return NextResponse.json({ error: "La sala no está abierta" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 400 });

    // ¿Ya está dentro?
    const already = await prisma.entry.findFirst({
      where: { roomId: room.id, userId: me.id },
    });
    if (already) {
      return NextResponse.json({ error: "Ya estás en la sala" }, { status: 400 });
    }

    // Siguiente posición libre
    const positionsTaken = room.entries.map((e) => e.position);
    let position = 1;
    while (positionsTaken.includes(position) && position <= room.capacity) position++;
    if (position > room.capacity) {
      return NextResponse.json({ error: "Sala llena" }, { status: 400 });
    }

    // 💳 Cobro del precio de entrada (saldo en centavos)
    try {
      await walletDebit({
        userId: me.id,
        amountCents: room.priceCents,
        reason: `Ingreso a sala ${room.title}`,
        kind: "JOIN_DEBIT",
        meta: { roomId: room.id, position },
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Saldo insuficiente" },
        { status: 400 }
      );
    }

    // Crear entrada
    await prisma.entry.create({
      data: { roomId: room.id, userId: me.id, position },
    });

    // Recontar
    const count = await prisma.entry.count({ where: { roomId: room.id } });
    const filled = count >= room.capacity;

    if (filled) {
      // Bloquear
      await prisma.room.update({
        where: { id: room.id },
        data: { state: "LOCKED", lockedAt: new Date() },
      });

      // Auto-finish (opcional) — respeta la preselección si existe
      if (process.env.AUTO_FINISH_ON_FULL === "true") {
        const fullRoom = await prisma.room.findUnique({
          where: { id: room.id },
          include: { entries: { orderBy: { position: "asc" }, include: { user: true } } },
        });

        if (fullRoom && fullRoom.entries.length > 0) {
          let winning = null as (typeof fullRoom.entries)[number] | null;

          if (fullRoom.preselectedPosition) {
            winning =
              fullRoom.entries.find((e) => e.position === fullRoom.preselectedPosition) ?? null;
          }
          if (!winning) {
            const idx = Math.floor(Math.random() * fullRoom.entries.length);
            winning = fullRoom.entries[idx];
          }

          const prizeCents = fullRoom.priceCents * 10;

          const updated = await prisma.room.update({
            where: { id: fullRoom.id },
            data: {
              state: "FINISHED",
              finishedAt: new Date(),
              winningEntryId: winning!.id,
              prizeCents,
              preselectedPosition: null, // limpia la preselección
            },
            include: { entries: { include: { user: true } } },
          });

          // 💸 Acreditar premio al ganador (para auto-finish)
          try {
            await walletCredit({
              userId: winning!.userId,
              amountCents: prizeCents,
              reason: `Premio sala ${updated.title} (auto)`,
              kind: "WIN_CREDIT",
              meta: { roomId: updated.id, entryId: winning!.id },
            });
          } catch (e) {
            // si falla el crédito, al menos la sala quedó finalizada; lo logueamos
            console.error("walletCredit (auto-finish) error:", e);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, position, filled });
  } catch (e) {
    console.error("join error:", e);
    return NextResponse.json({ error: "Error al unirse" }, { status: 500 });
  }
}
