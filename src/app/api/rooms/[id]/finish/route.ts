// src/app/api/rooms/[id]/finish/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletCredit } from "@/lib/wallet";
import { emitRoomUpdate } from "@/lib/emit-rooms";
import { buildRoomPayload } from "@/lib/room-payload";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const Param = z.object({ id: z.string().min(1) });
const Body = z
  .object({
    entryId: z.string().min(1).optional(),
    position: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = Param.parse(await ctx.params);
    const body = Body.parse(await req.json().catch(() => undefined)) ?? {};

    // 🔒 Transacción con bloqueo pesimista para evitar "Doble Ganador" (Race Condition)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Bloquear fila (Postgres)
      await tx.$executeRaw`SELECT 1 FROM "Room" WHERE "id" = ${id} FOR UPDATE`;

      // 2. Cargar estado fresco
      const roomHeader = await tx.room.findUnique({ where: { id } });
      if (!roomHeader) return { error: "Sala no encontrada", status: 404 };

      // 🛡️ Safeguard: Dice Duel must use /roll, not /finish
      if (roomHeader.gameType === "DICE_DUEL") {
        return { error: "Dice Duel uses /roll endpoint", status: 400 };
      }

      // 3. Idempotencia: Si ya finalizó, retornar éxito con datos actuales
      if (roomHeader.state === "FINISHED") {
        const winnerEntry = roomHeader.winningEntryId
          ? await tx.entry.findUnique({ where: { id: roomHeader.winningEntryId }, include: { user: true } })
          : null;
        return { alreadyFinished: true, room: roomHeader, winnerEntry };
      }

      // 4. Cargar entradas de LA RONDA ACTUAL (Fix Ghost Winner)
      const currentRound = (roomHeader as any).currentRound ?? 1;
      const entries = await tx.entry.findMany({
        where: { roomId: id, round: currentRound },
        orderBy: { position: "asc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      const room = { ...roomHeader, entries };

      // 5. Validaciones
      const role = (session?.user as any)?.role;
      const isPublicTrigger = room.gameType === "ROULETTE" && entries.length >= room.capacity;

      if (role !== "admin" && !isPublicTrigger) {
        return { error: "No autorizado", status: 403 };
      }

      if (room.state === "OPEN" && entries.length >= room.capacity) {
        await tx.room.update({ where: { id }, data: { state: "LOCKED", lockedAt: new Date() } });
        room.state = "LOCKED";
      }

      if (room.state !== "LOCKED" && room.state !== "OPEN") {
        return { error: "La sala debe estar LOCKED/OPEN", status: 400 };
      }
      if (entries.length === 0) return { error: "No hay participantes", status: 400 };

      // 6. Elegir Ganador
      let winningEntry: typeof entries[0] | null = null;
      let newMeta: any = room.gameMeta ?? null;
      const isRoulette = room.gameType === "ROULETTE";
      const isDice = room.gameType === "DICE_DUEL";

      if (isRoulette) {
        if (body.entryId) winningEntry = entries.find(e => e.id === body.entryId) ?? null;
        else if (body.position) winningEntry = entries.find(e => e.position === body.position) ?? null;
        else if ((room as any).preselectedPosition) winningEntry = entries.find(e => e.position === (room as any).preselectedPosition) ?? null;
        else winningEntry = entries[Math.floor(Math.random() * entries.length)];

        if (!winningEntry) return { error: "Ganador inválido (no en ronda actual)", status: 400 };
      }

      if (isDice) {
        if (entries.length !== 2) return { error: "Se necesitan 2 jugadores", status: 400 };
        const top = entries[0];
        const bottom = entries[1];
        const rollDie = () => 1 + Math.floor(Math.random() * 6);
        let tries = 0;
        let topPair: [number, number] = [0, 0];
        let bottomPair: [number, number] = [0, 0];
        do {
          tries++;
          topPair = [rollDie(), rollDie()];
          bottomPair = [rollDie(), rollDie()];
        } while (topPair[0] + topPair[1] === bottomPair[0] + bottomPair[1] && tries < 50);

        winningEntry = (topPair[0] + topPair[1] > bottomPair[0] + bottomPair[1]) ? top : bottom;
        newMeta = { ...(room.gameMeta ?? {}), dice: { top: topPair, bottom: bottomPair, tries } };
      }

      if (!winningEntry) return { error: "Error decidiendo ganador", status: 500 };

      // 7. Commit Update
      const ROULETTE_MULTIPLIER = 10;
      const metaObj = (room.gameMeta as any) ?? {};
      const potFallback = room.priceCents * entries.length;
      const prizeCents = isRoulette ? room.priceCents * ROULETTE_MULTIPLIER : (typeof metaObj.bankCents === "number" ? metaObj.bankCents : potFallback);

      const updated = await tx.room.update({
        where: { id },
        data: {
          state: "FINISHED",
          finishedAt: new Date(),
          winningEntryId: winningEntry.id,
          prizeCents,
          preselectedPosition: null,
          gameMeta: newMeta ?? undefined,
          gameResults: {
            create: {
              winnerUserId: winningEntry.user.id,
              winnerName: winningEntry.user.name || winningEntry.user.email,
              prizeCents,
              roundNumber: currentRound,
            }
          }
        },
        include: { entries: { include: { user: true }, orderBy: { position: "asc" } } },
      });

      return { success: true, updated, winningEntry, prizeCents };
    }, { timeout: 10000 });

    if ((result as any).error) {
      return NextResponse.json({ error: (result as any).error }, { status: (result as any).status });
    }

    // Respuesta Idempotente
    if ((result as any).alreadyFinished) {
      const { room, winnerEntry } = result as any;
      return NextResponse.json({
        ok: true, roomId: room.id, prizeCents: room.prizeCents, winningEntryId: room.winningEntryId,
        winner: winnerEntry?.user ? { user: winnerEntry.user, position: winnerEntry.position } : null,
      });
    }

    // Respuesta Nueva
    const { updated, winningEntry, prizeCents } = result as any;

    if (winningEntry.user && prizeCents > 0) {
      walletCredit({
        userId: winningEntry.user.id,
        amountCents: prizeCents,
        reason: `Premio sala ${updated.title}`,
        kind: "WIN_CREDIT",
        meta: { roomId: updated.id, entryId: winningEntry.id },
      }).catch(e => console.error("walletCredit error:", e));
    }

    const payload = await buildRoomPayload(prisma, updated.id);
    if (payload) await emitRoomUpdate(updated.id, payload);

    return NextResponse.json({
      ok: true, roomId: updated.id, prizeCents, winningEntryId: winningEntry.id,
      winner: { user: winningEntry.user, position: winningEntry.position },
      gameMeta: updated.gameMeta,
    });

  } catch (e) {
    console.error("finish error:", e);
    return NextResponse.json({ error: "Error al realizar el sorteo" }, { status: 500 });
  }
}
