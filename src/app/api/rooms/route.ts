// src/app/api/rooms/route.ts
import { NextResponse } from "next/server";
import { PrismaClient, RoomState } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic"; // evita caché de ruta
export const revalidate = 0;            // idem (no ISR)

const prisma = new PrismaClient();

const createSchema = z.object({
  priceCents: z.number().int().positive(),
  capacity: z.number().int().min(2).max(100).optional().default(12),
  title: z.string().min(1).optional(),
});

// GET /api/rooms?state=OPEN|LOCKED|DRAWING|FINISHED|ARCHIVED
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const state = searchParams.get("state") as RoomState | null;

    const where: Record<string, any> = {};
    // ✅ soporta todos los estados del enum
    if (state && (Object.values(RoomState) as string[]).includes(state)) {
      where.state = state;
    }

    const rooms = await prisma.room.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: { _count: { select: { entries: true } } },
    });

    const data = rooms.map((r) => ({
      id: r.id,
      title: r.title,
      priceCents: r.priceCents,
      state: r.state,
      capacity: r.capacity,
      createdAt: r.createdAt,
      slots: { taken: r._count.entries, free: r.capacity - r._count.entries },
    }));

    // (opcional) podrías añadir Cache-Control: no-store, pero con dynamic/revalidate ya basta
    return NextResponse.json(data);
  } catch (e) {
    console.error("rooms GET error:", e);
    return NextResponse.json({ error: "No se pudieron listar salas" }, { status: 500 });
  }
}

// POST /api/rooms
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = createSchema.parse(await req.json());
    const title =
      body.title ?? `Ruleta $${(body.priceCents / 100).toFixed(0)} (${body.capacity} puestos)`;

    const room = await prisma.room.create({
      data: {
        title,
        priceCents: body.priceCents,
        capacity: body.capacity,
        state: "OPEN",
      },
      include: { _count: { select: { entries: true } } },
    });

    return NextResponse.json({
      id: room.id,
      title: room.title,
      priceCents: room.priceCents,
      state: room.state,
      capacity: room.capacity,
      createdAt: room.createdAt,
      slots: { taken: room._count.entries, free: room.capacity - room._count.entries },
    });
  } catch (e) {
    console.error("rooms POST error:", e);
    return NextResponse.json({ error: "No se pudo crear la sala" }, { status: 500 });
  }
}
