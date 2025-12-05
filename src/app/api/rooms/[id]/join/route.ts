// src/app/api/rooms/[id]/join/route.ts
import { NextResponse } from "next/server";
import { RoomState, TxKind } from "@prisma/client";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { emitRoomUpdate, emitRoomsIndex } from "@/lib/emit-rooms";
import { buildRoomPayload } from "@/lib/room-payload";
import { walletCredit } from "@/lib/wallet"; // para acreditar premio
import { ratelimit } from "@/lib/ratelimit";
import prisma from "@/lib/prisma";

const Param = z.object({ id: z.string().min(1) });

const Body = z
  .object({
    quantity: z.number().int().min(1).max(100).optional(),
    positions: z.array(z.number().int().min(1)).optional(),
  })
  .refine((v) => v.quantity != null || (v.positions && v.positions.length > 0), {
    message: "Debes enviar quantity o positions",
    path: ["quantity"],
  });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = Param.parse(await ctx.params);
    const body = Body.parse(await req.json().catch(() => ({} as any)));

    // 🛡️ Rate Limiting
    const userId = (session.user as any).id;
    const { success } = await ratelimit.limit(userId);
    if (!success) {
      return NextResponse.json({ error: "Demasiados intentos. Calma." }, { status: 429 });
    }

    const room = await prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        state: true,
        priceCents: true,
        capacity: true,
        gameType: true,
        gameMeta: true,
        currentRound: true,
        entries: {
          select: { position: true, id: true, userId: true, round: true },
          // Filtrar entries de la ronda actual es mejor hacerlo en el query, pero
          // entries es un relation, para filtarlo necesitamos un include where o hacerlo manual
          // aqui haremos fetch manual luego o filtro JS si son pocas.
        },
      },
    });
    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    if (room.state !== RoomState.OPEN) {
      return NextResponse.json({ error: "La sala no está abierta" }, { status: 400 });
    }

    // Filtrar solo las entradas de la ronda actual
    const currentRoundEntries = room.entries.filter((e) => e.round === room.currentRound);

    const me = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true, balanceCents: true },
    });
    if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 400 });

    const takenSet = new Set(currentRoundEntries.map((e) => e.position));
    const freePositionsNow = Array.from({ length: room.capacity })
      .map((_, i) => i + 1)
      .filter((p) => !takenSet.has(p));
    if (freePositionsNow.length === 0) {
      return NextResponse.json({ error: "Sala llena" }, { status: 400 });
    }

    let positionsToAssign: number[] = [];
    if (Array.isArray(body.positions) && body.positions.length > 0) {
      const uniq = Array.from(new Set(body.positions)).sort((a, b) => a - b);
      for (const p of uniq) {
        if (p < 1 || p > room.capacity) {
          return NextResponse.json({ error: `Puesto fuera de rango: #${p}` }, { status: 400 });
        }
        if (takenSet.has(p)) {
          return NextResponse.json({ error: `Puesto ya ocupado: #${p}` }, { status: 409 });
        }
      }
      positionsToAssign = uniq;
    } else {
      const quantity = Math.min(body.quantity ?? 1, freePositionsNow.length);
      if (quantity <= 0) {
        return NextResponse.json({ error: "Sin puestos disponibles" }, { status: 400 });
      }
      positionsToAssign = freePositionsNow.slice(0, quantity);
    }

    if (room.gameType === "DICE_DUEL") {
      if (positionsToAssign.length > 1) {
        return NextResponse.json(
          { error: "En Dados 1v1 solo puedes tomar 1 puesto por operación." },
          { status: 400 }
        );
      }
      const alreadyInside = currentRoundEntries.some((e) => e.userId === me.id);
      if (alreadyInside) {
        return NextResponse.json(
          { error: "Ya tienes un puesto en este duelo. No puedes ocupar ambos." },
          { status: 400 }
        );
      }
    }

    const qty = positionsToAssign.length;
    const totalCents = qty * room.priceCents;

    const result = await prisma.$transaction(async (tx) => {
      // Re-verificar en transacción para evitar condiciones de carrera
      const current = await tx.entry.findMany({
        where: { roomId: room.id, round: room.currentRound },
        select: { position: true, userId: true },
      });

      const currentSet = new Set(current.map((e) => e.position));

      if (room.gameType === "DICE_DUEL" && current.some((e) => e.userId === me.id)) {
        throw new Error("Ya tienes un puesto en este duelo. No puedes ocupar ambos.");
      }

      for (const p of positionsToAssign) {
        if (currentSet.has(p)) throw new Error(`Puesto ya ocupado: #${p}`);
      }

      const u = await tx.user.findUnique({ where: { id: me.id }, select: { balanceCents: true } });
      if (!u) throw new Error("Usuario no existe");
      if (u.balanceCents < totalCents) throw new Error("Saldo insuficiente");

      await tx.user.update({
        where: { id: me.id },
        data: { balanceCents: { decrement: totalCents } },
      });
      await tx.transaction.create({
        data: {
          userId: me.id,
          amountCents: -totalCents,
          kind: TxKind.JOIN_DEBIT,
          reason: `Ingreso a sala ${room.title} (Ronda ${room.currentRound}) x${qty}`,
          meta: { roomId: room.id, qty, priceCents: room.priceCents, positions: positionsToAssign, round: room.currentRound },
        },
      });

      await tx.entry.createMany({
        data: positionsToAssign.map((pos) => ({
          roomId: room.id,
          userId: me.id,
          position: pos,
          round: room.currentRound, // 👈 Se guarda la ronda
        })),
      });

      const after = await tx.entry.findMany({
        where: { roomId: room.id, round: room.currentRound },
        orderBy: { position: "asc" },
      });

      let newState: RoomState = room.state;

      // ... (rest of logic unchanged from here for locking, dice duel, etc.)

      if (after.length >= room.capacity || (room.gameType === "DICE_DUEL" && after.length === 2)) {
        newState = RoomState.LOCKED;

        // ... (previous logic for dice duel locking copied below for completeness if needed, but context suggests I am replacing partial)
        if (room.gameType === "DICE_DUEL" && after.length === 2) {
          const p1 = after[0].userId;
          const p2 = after[1].userId;

          if (p1 === p2) throw new Error("Regla 1v1: no puede haber dos asientos del mismo usuario.");

          const newBank = room.priceCents * 2;
          const newMeta = {
            bankCents: newBank,
            balances: { [p1]: room.priceCents, [p2]: room.priceCents },
            rolls: {},
            ready: {},
            history: [],
            dice: undefined,
            ended: false,
          } as any;

          await tx.room.update({
            where: { id: room.id },
            data: { state: newState, lockedAt: new Date(), gameMeta: newMeta },
          });
        } else {
          // ROULETTE or others
          await tx.room.update({
            where: { id: room.id },
            data: { state: newState, lockedAt: new Date() },
          });
        }
      }
      return { positions: positionsToAssign, newState };
    });

    // Emit detalle + índice tras cada join
    // Optimizacion: emitRoomUpdate manda refresh signal, no payload.
    await emitRoomUpdate(room.id);
    await emitRoomsIndex();

    // NOTA: El autofinish de ruleta se maneja en finish/route.ts o trigger externo
    // pero aqui habia un bloque de autofinish si se llena ruleta?
    // Sí, lines 211-262.
    // Debemos mantener ese bloque o moverlo a un endpoint dedicado.
    // El código original lo tenía. Vamos a conservarlo pero llamar al endpoint /finish
    // OJO: El usuario pidió que NO quede en FINISHED, sino se re-abra.
    // Eso implica cambiar la lógica de ese bloque (o del finish route).
    // Si dejamos este bloque aquí, duplicamos lógica. Mejor llamar a fetch /finish como hace el frontend
    // o simplemente no hacer nada y dejar que el frontend o un cron lo dispare.
    // El frontend RoomPage tiene un `tryAutoFinishRoulette`.
    // Pero si queremos robustez, deberíamos hacerlo aquí si se llenó.

    // Para simplificar y cumplir el "autofinish", vamos a dejar que el frontend o el worker dispare /finish
    // ya que /finish tendrá la lógica compleja de reset. 
    // ELIMINAMOS el bloque de autofinish inline de aquí para no duplicar la lógica de "GameResult + Reset".

    return NextResponse.json({
      ok: true,
      roomId: room.id,
      positions: result.positions,
      chargedCents: totalCents,
      state: result.newState,
    });
  } catch (e: any) {
    const msg = e?.message || "Error al unirse";
    console.error("join error:", msg);
    const code =
      msg.includes("Puesto ya ocupado") ? 409 :
        msg.includes("Saldo insuficiente") ? 402 :
          msg.includes("1v1") || msg.includes("Ya tienes un puesto") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
