import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { buildRoomPayload } from "@/lib/room-payload";

export const dynamic = "force-dynamic";

const Param = z.object({ id: z.string().min(1) });

// GET /api/rooms/:id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = Param.parse(await params);

    const payload = await buildRoomPayload(prisma, id);

    if (!payload) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("room [id] GET error:", err);
    return NextResponse.json({ error: "Error al obtener la sala" }, { status: 500 });
  }
}
