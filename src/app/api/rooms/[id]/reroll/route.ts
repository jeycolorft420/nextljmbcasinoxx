// src/app/api/rooms/[id]/reroll/route.ts
import { NextResponse } from "next/server";
import { RoomState, TxKind } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { z } from "zod";

import { emitRoomUpdate } from "@/modules/rooms/lib/emit-rooms";
import { buildRoomPayload } from "@/modules/rooms/lib/room-payload";
import prisma from "@/modules/ui/lib/prisma";

const Param = z.object({ id: z.string().min(1) });
const ROUND_UNIT = 100; // $1 por ronda

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const { id } = Param.parse(await ctx.params);

    let body: any = {};
    try { body = await req.json(); } catch { }
    const isForfeit = !!body?.forfeit;

    const room = await prisma.room.findUnique({
      where: { id },
      include: { entries: { include: { user: true }, orderBy: { position: "asc" } } },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    if (room.gameType !== "DICE_DUEL") {
      return NextResponse.json({ error: "Solo para Dados 1v1" }, { status: 400 });
    }
    if (room.entries.length !== 2) {
      return NextResponse.json({ error: "Se necesitan 2 jugadores" }, { status: 400 });
    }

    const meEntry = room.entries.find((e) => e.user.email === session.user!.email);
    if (!meEntry) return NextResponse.json({ error: "No participas en esta sala" }, { status: 403 });
    const otherEntry = room.entries.find((e) => e.userId !== meEntry.userId)!;

    const meta = (room.gameMeta ?? {}) as any;

    if (meta?.ended) {
      return NextResponse.json({ ok: true, status: "ENDED" });
    }

    const balances: Record<string, number> = {
      [room.entries[0].userId]: meta?.balances?.[room.entries[0].userId] ?? room.priceCents,
      [room.entries[1].userId]: meta?.balances?.[room.entries[1].userId] ?? room.priceCents,
    };
    const bankCents =
      typeof meta.bankCents === "number"
        ? meta.bankCents
        : (balances[room.entries[0].userId] + balances[room.entries[1].userId]);

    const ready: Record<string, boolean> = { ...(meta.ready || {}) };

    // --- FORFEIT ---
    if (isForfeit) {
      const oppReady = !!ready[otherEntry.userId];
      const myReady = !!ready[meEntry.userId];
      if (!(oppReady && !myReady)) {
        return NextResponse.json({ error: "Forfeit inválido en este estado" }, { status: 409 });
      }

      const winnerEntry = otherEntry;
      const loserEntry = meEntry;

      balances[winnerEntry.userId] = Math.max(0, (balances[winnerEntry.userId] ?? room.priceCents) + ROUND_UNIT);
      balances[loserEntry.userId] = Math.max(0, (balances[loserEntry.userId] ?? room.priceCents) - ROUND_UNIT);

      const newHistory = [
        ...((meta.history ?? []) as any[]),
        {
          at: new Date().toISOString(),
          round: ((meta.history?.length ?? 0) + 1),
          dice: null,
          timeoutForfeiterUserId: meEntry.userId,
          winnerEntryId: winnerEntry.id,
          prizeCents: ROUND_UNIT * 2,
          balancesAfter: {
            [room.entries[0].userId]: balances[room.entries[0].userId],
            [room.entries[1].userId]: balances[room.entries[1].userId],
          },
        },
      ];

      let finalWinnerUserId: string | null = null;
      if (balances[loserEntry.userId] <= 0) finalWinnerUserId = winnerEntry.userId;
      if (balances[winnerEntry.userId] <= 0) finalWinnerUserId = loserEntry.userId;

      if (finalWinnerUserId) {
        const finalWinnerEntry = room.entries.find(e => e.userId === finalWinnerUserId)!;

        await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: finalWinnerUserId! },
            data: { balanceCents: { increment: bankCents } },
          });
          await tx.transaction.create({
            data: {
              userId: finalWinnerUserId!,
              amountCents: bankCents,
              kind: TxKind.WIN_CREDIT,
              reason: `Ganó duelo completo ${room.title} (forfeit)`,
              meta: { roomId: room.id },
            },
          });

          await tx.room.update({
            where: { id: room.id },
            data: {
              state: RoomState.FINISHED,
              finishedAt: new Date(),
              winningEntryId: finalWinnerEntry.id,
              prizeCents: bankCents,
              gameMeta: {
                balances, bankCents, ready: {},
                history: newHistory,
                dice: undefined,
                ended: true,
              } as any,
            },
          });
        });

        const payloadEnd = await buildRoomPayload(prisma, room.id);
        if (payloadEnd) await emitRoomUpdate(room.id, payloadEnd);

        return NextResponse.json({ ok: true, status: "ENDED", finalWinnerUserId, bankCents });
      }

      const updated = await prisma.room.update({
        where: { id: room.id },
        data: {
          state: RoomState.FINISHED,
          finishedAt: new Date(),
          winningEntryId: winnerEntry.id,
          prizeCents: ROUND_UNIT * 2,
          gameMeta: {
            balances, bankCents, ready: {}, history: newHistory,
            dice: undefined,
          } as any,
        },
      });

      const payloadF = await buildRoomPayload(prisma, room.id);
      if (payloadF) await emitRoomUpdate(room.id, payloadF);

      return NextResponse.json({ ok: true, status: "FORFEIT", winningEntryId: updated.winningEntryId });
    }

    // --- FLUJO NORMAL ---
    ready[meEntry.userId] = true;

    if (!ready[otherEntry.userId]) {
      await prisma.room.update({
        where: { id: room.id },
        data: {
          state: RoomState.FINISHED,
          finishedAt: new Date(),
          winningEntryId: null,
          prizeCents: null,
          gameMeta: { ...meta, balances, bankCents, ready },
        },
      });

      const payloadWait = await buildRoomPayload(prisma, room.id);
      if (payloadWait) await emitRoomUpdate(room.id, payloadWait);

      return NextResponse.json({ ok: true, status: "WAITING" });
    }

    const roll = () => 1 + Math.floor(Math.random() * 6);
    let top: [number, number] = [0, 0];
    let bottom: [number, number] = [0, 0];
    do {
      top = [roll(), roll()];
      bottom = [roll(), roll()];
    } while (top[0] + top[1] === bottom[0] + bottom[1]);

    const topSum = top[0] + top[1];
    const bottomSum = bottom[0] + bottom[1];
    const winnerEntry = topSum > bottomSum ? room.entries[0] : room.entries[1];
    const loserEntry = winnerEntry.id === room.entries[0].id ? room.entries[1] : room.entries[0];

    balances[winnerEntry.userId] = Math.max(0, (balances[winnerEntry.userId] ?? room.priceCents) + ROUND_UNIT);
    balances[loserEntry.userId] = Math.max(0, (balances[loserEntry.userId] ?? room.priceCents) - ROUND_UNIT);

    const newHistory = [
      ...((meta.history ?? []) as any[]),
      {
        at: new Date().toISOString(),
        round: ((meta.history?.length ?? 0) + 1),
        dice: { top, bottom },
        winnerEntryId: winnerEntry.id,
        prizeCents: ROUND_UNIT * 2,
        balancesAfter: {
          [room.entries[0].userId]: balances[room.entries[0].userId],
          [room.entries[1].userId]: balances[room.entries[1].userId],
        },
      },
    ];

    let finalWinnerUserId: string | null = null;
    if (balances[loserEntry.userId] <= 0) finalWinnerUserId = winnerEntry.userId;
    if (balances[winnerEntry.userId] <= 0) finalWinnerUserId = loserEntry.userId;

    if (finalWinnerUserId) {
      const finalWinnerEntry = room.entries.find(e => e.userId === finalWinnerUserId)!;

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: finalWinnerUserId! },
          data: { balanceCents: { increment: bankCents } },
        });
        await tx.transaction.create({
          data: {
            userId: finalWinnerUserId!,
            amountCents: bankCents,
            kind: TxKind.WIN_CREDIT,
            reason: `Ganó duelo completo ${room.title}`,
            meta: { roomId: room.id },
          },
        });

        await tx.room.update({
          where: { id: room.id },
          data: {
            state: RoomState.FINISHED,
            finishedAt: new Date(),
            winningEntryId: finalWinnerEntry.id,
            prizeCents: bankCents,
            gameMeta: {
              balances, bankCents, ready: {},
              history: newHistory,
              dice: { top, bottom },
              ended: true,
            } as any,
          },
        });
      });

      const payloadEnd = await buildRoomPayload(prisma, room.id);
      if (payloadEnd) await emitRoomUpdate(room.id, payloadEnd);

      return NextResponse.json({ ok: true, status: "ENDED", finalWinnerUserId, bankCents });
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        state: RoomState.FINISHED,
        finishedAt: new Date(),
        winningEntryId: winnerEntry.id,
        prizeCents: ROUND_UNIT * 2,
        gameMeta: {
          balances, bankCents, ready: {}, history: newHistory,
          dice: { top, bottom },
        } as any,
      },
    });

    const payloadPlayed = await buildRoomPayload(prisma, room.id);
    if (payloadPlayed) await emitRoomUpdate(room.id, payloadPlayed);

    return NextResponse.json({
      ok: true,
      status: "PLAYED",
      winningEntryId: updated.winningEntryId,
      prizeCents: updated.prizeCents,
    });
  } catch (e: any) {
    console.error("reroll error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Error al jugar la ronda" }, { status: 500 });
  }
}

