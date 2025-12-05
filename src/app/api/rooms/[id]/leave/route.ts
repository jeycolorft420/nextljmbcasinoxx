// src/app/api/rooms/[id]/leave/route.ts
import { NextResponse } from "next/server";
import { RoomState, TxKind } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";

import { emitRoomUpdate } from "@/lib/emit-rooms";
import { buildRoomPayload } from "@/lib/room-payload";
import prisma from "@/lib/prisma";
const Param = z.object({ id: z.string().min(1) });

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const { id } = Param.parse(await ctx.params);

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        entries: { include: { user: true }, orderBy: { position: "asc" } },
      },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });

    const me = room.entries.find((e) => e.user.email === session.user!.email);
    if (!me) {
      return NextResponse.json({ error: "No participas en esta sala" }, { status: 400 });
    }

    // === DADOS 1v1 ===
    if (room.gameType === "DICE_DUEL" && room.entries.length === 2) {
      const meta = (room.gameMeta ?? {}) as any;
      const duelEnded = !!meta?.ended;

      if (!duelEnded) {
        const rival = room.entries.find((e) => e.userId !== me.userId)!;

        const aId = room.entries[0].user.id;
        const bId = room.entries[1].user.id;
        const balances: Record<string, number> = {
          [aId]: typeof meta?.balances?.[aId] === "number" ? meta.balances[aId] : room.priceCents,
          [bId]: typeof meta?.balances?.[bId] === "number" ? meta.balances[bId] : room.priceCents,
        };

        const bankCents = (balances[aId] ?? 0) + (balances[bId] ?? 0);

        const historyEntry = {
          at: new Date().toISOString(),
          round: Number(((meta.history?.length ?? 0) + 1)),
          reason: "ABANDON",
          winnerEntryId: rival.id,
          prizeCents: bankCents,
          dice: undefined,
          balancesAfter: {
            [me.user.id]: 0,
            [rival.user.id]: bankCents,
          },
        };

        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: rival.userId },
            data: { balanceCents: { increment: bankCents } },
          });
          await tx.transaction.create({
            data: {
              userId: rival.userId,
              amountCents: bankCents,
              kind: TxKind.WIN_CREDIT,
              reason: `Rival abandonó · ${room.title}`,
              meta: { roomId: room.id },
            },
          });

          await tx.entry.deleteMany({ where: { roomId: room.id } });
          await tx.room.update({
            where: { id: room.id },
            data: {
              state: RoomState.OPEN,
              lockedAt: null,
              finishedAt: null,
              winningEntryId: null,
              prizeCents: null,
              rolledAt: null,
              preselectedPosition: null,
              gameMeta: {
                history: [...(meta.history ?? []), historyEntry],
                ready: {},
                balances: {},
                dice: undefined,
              } as any,
            },
          });
        });

        const payload = await buildRoomPayload(prisma, room.id);
        if (payload) await emitRoomUpdate(room.id, payload);

        return NextResponse.json({
          ok: true,
          winner: "rival",
          paidCents: bankCents,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.entry.deleteMany({ where: { roomId: room.id } });
        await tx.room.update({
          where: { id: room.id },
          data: {
            state: RoomState.OPEN,
            lockedAt: null,
            finishedAt: null,
            winningEntryId: null,
            prizeCents: null,
            rolledAt: null,
            preselectedPosition: null,
            gameMeta: { ...((room.gameMeta as object) ?? {}), ready: {}, balances: {}, dice: undefined } as any,
          },
        });
      });

      const payload2 = await buildRoomPayload(prisma, room.id);
      if (payload2) await emitRoomUpdate(room.id, payload2);

      return NextResponse.json({ ok: true });
    }

    // === Ruleta u otros juegos ===
    await prisma.$transaction(async (tx) => {
      await tx.entry.delete({ where: { id: me.id } });
      await tx.room.update({
        where: { id: room.id },
        data: {
          state: RoomState.OPEN,
          lockedAt: null,
          finishedAt: null,
          winningEntryId: null,
          prizeCents: null,
          rolledAt: null,
          preselectedPosition: null,
          gameMeta: { ...((room.gameMeta as object) ?? {}), ready: {}, dice: undefined } as any,
        },
      });
    });

    const payload = await buildRoomPayload(prisma, room.id);
    if (payload) await emitRoomUpdate(room.id, payload);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("leave error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "No se pudo abandonar la sala" }, { status: 500 });
  }
}
