// src/app/api/rooms/[id]/reset/route.ts
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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = paramSchema.parse(await params);

    // Traer sala con inscripciones para decidir si se reembolsa
    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    }

    // 💸 Reembolso solo si AÚN NO estaba finalizada
    if (room.state !== "FINISHED") {
      for (const entry of room.entries) {
        try {
          await walletCredit({
            userId: entry.userId,
            amountCents: room.priceCents,
            reason: `Reembolso sala ${room.title}`,
            kind: "REFUND",
            meta: { roomId: room.id, entryId: entry.id },
          });
        } catch (e) {
          console.error("refund error:", e);
        }
      }
    }

    // Borrar inscripciones
    await prisma.entry.deleteMany({ where: { roomId: id } });

    // Reabrir sala y limpiar campos de sorteo
    await prisma.room.update({
      where: { id },
      data: {
        state: "OPEN",
        lockedAt: null,
        finishedAt: null,
        rolledAt: null,
        winningEntryId: null,
        prizeCents: null,
        preselectedPosition: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("reset error:", e);
    return NextResponse.json({ error: "No se pudo resetear" }, { status: 500 });
  }
}
