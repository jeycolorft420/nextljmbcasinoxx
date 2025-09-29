import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = params;

  const room = await prisma.room.findUnique({
    where: { id },
    include: { entries: true },
  });

  if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
  if (room.state !== "LOCKED")
    return NextResponse.json({ error: "La sala no está lista para sorteo" }, { status: 400 });

  if (room.entries.length !== room.capacity)
    return NextResponse.json({ error: "La sala no está completa" }, { status: 400 });

  // elegir ganador al azar
  const winnerIndex = crypto.randomInt(0, room.entries.length);
  const winner = room.entries[winnerIndex];

  const updated = await prisma.room.update({
    where: { id: room.id },
    data: {
      state: "FINISHED",
      finishedAt: new Date(),
      winningEntryId: winningEntry!.id,
      prizeCents: room.priceCents * 10,
      preselectedPosition: null,             // 👈 limpia la preselección
    },
    include: { entries: { include: { user: true }, orderBy: { position: "asc" } } },
  });

  return NextResponse.json({ ok: true, room: updated, winner });
}
