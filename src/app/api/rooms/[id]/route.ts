import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/modules/ui/lib/prisma";
import { buildRoomPayload } from "@/modules/rooms/lib/room-payload";
import { checkAndMaintenanceRoom } from "@/modules/rooms/lib/game-maintenance";

export const dynamic = "force-dynamic";

const Param = z.object({ id: z.string().min(1) });

// GET /api/rooms/:id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = Param.parse(await params);

    // 🔒 LAZY MAINTENANCE: Trigger game start/bot fill if time expired
    // We do this before building payload so user sees the result immediately
    const roomHeader = await prisma.room.findUnique({ where: { id } });
    if (roomHeader) {
      await checkAndMaintenanceRoom(roomHeader);
    }

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

