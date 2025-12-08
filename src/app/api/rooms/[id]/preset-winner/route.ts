// src/app/api/rooms/[id]/preset-winner/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const prisma = new PrismaClient();

const paramSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({
  position: z.number().int().min(1).max(100), // validaremos capacity real abajo
});

// POST /api/rooms/:id/preset-winner
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Solo admin
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin" && role !== "god") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = paramSchema.parse(await params);
    const { position } = bodySchema.parse(await req.json());

    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }

    // No permitir preset si ya terminó o fue archivada
    if (room.state === "FINISHED" || room.state === "ARCHIVED") {
      return NextResponse.json(
        { error: "La sala ya no admite preselección" },
        { status: 400 }
      );
    }

    // Validar contra capacity real
    if (position < 1 || position > room.capacity) {
      return NextResponse.json({ error: "Posición fuera de rango" }, { status: 400 });
    }

    await prisma.room.update({
      where: { id },
      data: { preselectedPosition: position },
    });

    // (Opcional) Aviso si aún no hay participante en esa posición
    const occupied = room.entries.some((e) => e.position === position);

    return NextResponse.json({
      ok: true,
      preselectedPosition: position,
      note: occupied ? undefined : "Actualmente no hay participante en esa posición.",
    });
  } catch (err) {
    console.error("preset-winner error:", err);
    return NextResponse.json({ error: "Error al preseleccionar ganador" }, { status: 500 });
  }
}

// GET informativo (opcional)
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST { position: number }" });
}

