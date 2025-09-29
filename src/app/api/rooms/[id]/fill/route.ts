import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const paramSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({
  count: z.number().int().min(1).optional(), // cuántos lugares llenar
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> } // Next 15: params como Promise
) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = paramSchema.parse(await params);
    const body = await req.json().catch(() => ({}));
    const { count } = bodySchema.parse(body);

    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: { select: { position: true } } },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    if (room.state === "FINISHED")
      return NextResponse.json({ error: "La sala ya está finalizada" }, { status: 400 });

    // posiciones ocupadas y libres
    const taken = new Set(room.entries.map(e => e.position));
    const freePositions: number[] = [];
    for (let p = 1; p <= room.capacity; p++) if (!taken.has(p)) freePositions.push(p);

    if (freePositions.length === 0) {
      return NextResponse.json({ ok: true, note: "Sala ya está llena" });
    }

    const toFill = Math.min(count ?? freePositions.length, freePositions.length);

    // hash de password para bots
    const hashed = await bcrypt.hash("demo12345", 10);
    const createdEntries = [];

    for (let i = 0; i < toFill; i++) {
      const email = `bot_${Date.now()}_${i}_${Math.floor(Math.random()*1e6)}@demo.local`;
      const bot = await prisma.user.create({
        data: {
          email,
          name: `Bot ${i + 1}`,
          password: hashed,
          role: "user",
        },
        select: { id: true },
      });

      const entry = await prisma.entry.create({
        data: {
          roomId: room.id,
          userId: bot.id,
          position: freePositions[i],
        },
      });

      createdEntries.push(entry);
    }

    // si ahora quedó llena → LOCKED
    const entriesCount = room.entries.length + createdEntries.length;
    if (entriesCount >= room.capacity && room.state !== "LOCKED") {
      await prisma.room.update({
        where: { id: room.id },
        data: { state: "LOCKED", lockedAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true, added: createdEntries.length });
  } catch (e) {
    return NextResponse.json({ error: "Error al llenar la sala" }, { status: 500 });
  }
}
