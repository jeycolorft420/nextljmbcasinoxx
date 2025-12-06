// src/app/api/rooms/[id]/fill/route.ts
import { NextResponse } from "next/server";
import { RoomState } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { REAL_NAMES } from "@/lib/names";
import { emitRoomsIndex, emitRoomUpdate } from "@/lib/emit-rooms";
import { walletCredit } from "@/lib/wallet"; // 👈 para acreditar premio al ganador
import prisma from "@/lib/prisma";

const paramSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({
  count: z.number().int().min(1).optional(),
});

const BOT_DOMAIN = "bots.local";
const BOT_POOL_SIZE = REAL_NAMES.length;

function toEmailSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin" && role !== "god") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = paramSchema.parse(await params);
    const body = await req.json().catch(() => ({}));
    const { count } = bodySchema.parse(body);

    const roomHeader = await prisma.room.findUnique({
      where: { id },
    });
    if (!roomHeader) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    if (roomHeader.state === "FINISHED")
      return NextResponse.json({ error: "La sala ya está finalizada" }, { status: 400 });

    const currentRound = (roomHeader as any).currentRound ?? 1;

    // Fetch entries JUST for this round to calculate free positions
    const currentEntries = await prisma.entry.findMany({
      where: { roomId: id, round: currentRound },
      select: { position: true, userId: true }
    });

    // posiciones libres
    const takenPos = new Set(currentEntries.map((e) => e.position));
    const freePositions: number[] = [];
    for (let p = 1; p <= roomHeader.capacity; p++) if (!takenPos.has(p)) freePositions.push(p);
    if (freePositions.length === 0) return NextResponse.json({ ok: true, note: "Sala ya llena" });

    const toFill = Math.min(count ?? freePositions.length, freePositions.length);

    // ====== Asegurar POOL de bots (persistentes, nombres reales) ======
    const existingBots = await prisma.user.findMany({
      where: { isBot: true },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    let bots = existingBots;
    if (bots.length < BOT_POOL_SIZE) {
      const hashed = await bcrypt.hash("demo12345", 10);
      const existingEmails = new Set(bots.map((b) => b.email));
      const toCreate = REAL_NAMES
        .map((name, idx) => {
          const email = `${toEmailSlug(name) || "bot"}${idx + 1}@${BOT_DOMAIN}`;
          return { name, email };
        })
        .filter((n) => !existingEmails.has(n.email))
        .slice(0, BOT_POOL_SIZE - bots.length);

      if (toCreate.length > 0) {
        await prisma.user.createMany({
          data: toCreate.map((n) => ({
            email: n.email,
            name: n.name,
            password: hashed,
            role: "user",
            isBot: true,
          })),
        });
        bots = await prisma.user.findMany({
          where: { isBot: true },
          select: { id: true, email: true, name: true },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    // Preferir bots que aún no están en ESTA sala (en esta ronda)
    const alreadyInRoom = new Set(currentEntries.map((e) => e.userId));
    const candidates = bots.filter((b) => !alreadyInRoom.has(b.id));
    const poolForThisFill = (candidates.length >= toFill ? candidates : bots).slice();

    // barajar
    for (let i = poolForThisFill.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [poolForThisFill[i], poolForThisFill[j]] = [poolForThisFill[j], poolForThisFill[i]];
    }
    const selectedBots = poolForThisFill.slice(0, toFill);

    // crear entries vinculadas a la ronda actual
    await prisma.entry.createMany({
      data: selectedBots.map((b, i) => ({
        roomId: roomHeader.id,
        userId: b.id,
        position: freePositions[i],
        round: currentRound, // 👈 Important
      })),
    });

    // ¿quedó llena?
    // Recalcular total entries for this round
    const totalNow = currentEntries.length + toFill;
    let autoFinished = false;

    if (totalNow >= roomHeader.capacity) {
      // LOCK si no lo estaba
      if (roomHeader.state !== RoomState.LOCKED) {
        await prisma.room.update({
          where: { id: roomHeader.id },
          data: { state: RoomState.LOCKED, lockedAt: new Date() },
        });
      }

      // 🎯 Auto-finzalizar SOLO para Ruleta (giro automático)
      if (roomHeader.gameType === "ROULETTE") {
        // Cargar entries SOLO de esta ronda para elegir ganador
        const fullEntries = await prisma.entry.findMany({
          where: { roomId: roomHeader.id, round: currentRound },
          orderBy: { position: "asc" },
          include: { user: true }
        });

        if (fullEntries.length > 0) {
          // Preferencia: preselectedPosition ocupado -> gana; sino aleatorio
          const prePos = (roomHeader as any).preselectedPosition as number | null | undefined;
          let winningEntry = prePos
            ? fullEntries.find((e) => e.position === prePos) ?? null
            : null;

          if (!winningEntry) {
            const idx = Math.floor(Math.random() * fullEntries.length);
            winningEntry = fullEntries[idx]!;
          }

          const prizeCents = roomHeader.priceCents * 10;

          // Persistir resultado y limpiar preselected
          const updated = await prisma.room.update({
            where: { id: roomHeader.id },
            data: {
              state: "FINISHED",
              finishedAt: new Date(),
              winningEntryId: winningEntry!.id,
              prizeCents,
              preselectedPosition: null, // Limpiar
              // Crear historial
              gameResults: {
                create: {
                  winnerUserId: winningEntry.userId,
                  winnerName: winningEntry.user.name || winningEntry.user.email,
                  prizeCents,
                  roundNumber: currentRound,
                }
              }
            },
            include: {
              // Return entries filtered? emitted update will assume full list.
              // emitRoomUpdate builds from payload which I fixed.
              // We just need basic data returned here if we use `updated` downstream?
              // Actually emitRoomUpdate fetches fresh data.
            }
          });

          // 💸 acreditar premio
          try {
            await walletCredit({
              userId: winningEntry!.userId,
              amountCents: prizeCents,
              reason: `Premio sala ${updated.title}`,
              kind: "WIN_CREDIT",
              meta: { roomId: updated.id, entryId: winningEntry!.id },
            });
          } catch (e) {
            console.error("walletCredit (auto finish roulette) error:", e);
          }

          autoFinished = true;
        }
      }
    }

    // 👇 realtime
    await emitRoomsIndex();
    await emitRoomUpdate(roomHeader.id);

    return NextResponse.json({
      ok: true,
      added: toFill,
      autoFinished, // true si Ruleta finalizó automáticamente (dispara animación en los clientes)
      usedBots: selectedBots.map((b) => ({ id: b.id, name: b.name, email: b.email })),
    });
  } catch (e) {
    console.error("fill error:", e);
    return NextResponse.json({ error: "Error al llenar la sala" }, { status: 500 });
  }
}
