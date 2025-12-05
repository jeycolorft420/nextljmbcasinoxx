import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const paramSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({
  position: z.number().int().min(1).max(100),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = paramSchema.parse(await params);
    const { position } = bodySchema.parse(await req.json());

    const room = await prisma.room.findUnique({ where: { id } });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });

    if (position < 1 || position > room.capacity) {
      return NextResponse.json({ error: "Posición fuera de rango" }, { status: 400 });
    }

    await prisma.room.update({
      where: { id },
      data: { preselectedPosition: position },
    });

    return NextResponse.json({ ok: true, preselectedPosition: position });
  } catch (e) {
    console.error("preset-winner error:", e);
    return NextResponse.json({ error: "Error al preseleccionar ganador" }, { status: 500 });
  }
}
