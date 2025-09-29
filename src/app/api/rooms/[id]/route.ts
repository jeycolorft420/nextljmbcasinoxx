// src/app/api/rooms/[id]/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const prisma = new PrismaClient();
const paramSchema = z.object({ id: z.string().min(1) });

// GET /api/rooms/:id
export async function GET(
  _req: Request,
  // 👇 params es Promise en rutas dinámicas App Router
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 👇 hay que await antes de usarlo (sino Next lanza warning/error)
    const { id } = paramSchema.parse(await params);

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { position: "asc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }

    // construir slots 1..capacity
    const slots = Array.from({ length: room.capacity }, (_, idx) => {
      const position = idx + 1;
      const entry = room.entries.find((e) => e.position === position);
      return {
        position,
        taken: Boolean(entry),
        user: entry
          ? { id: entry.user.id, name: entry.user.name, email: entry.user.email }
          : null,
        entryId: entry?.id ?? null,
      };
    });

    const counts = {
      taken: room.entries.length,
      free: room.capacity - room.entries.length,
    };

    return NextResponse.json({
      id: room.id,
      title: room.title,
      priceCents: room.priceCents,
      state: room.state,
      capacity: room.capacity,
      createdAt: room.createdAt,
      lockedAt: room.lockedAt,
      finishedAt: room.finishedAt,
      // 👇 campos útiles para UI de sorteo/preset
      prizeCents: (room as any).prizeCents ?? null,
      winningEntryId: (room as any).winningEntryId ?? null,
      preselectedPosition: (room as any).preselectedPosition ?? null,

      counts,
      slots,

      // lista plana de inscripciones
      entries: room.entries.map((e) => ({
        id: e.id,
        position: e.position,
        user: { id: e.user.id, name: e.user.name, email: e.user.email },
      })),
    });
  } catch (err) {
    console.error("room [id] GET error:", err);
    return NextResponse.json({ error: "Error al obtener la sala" }, { status: 500 });
  }
}
