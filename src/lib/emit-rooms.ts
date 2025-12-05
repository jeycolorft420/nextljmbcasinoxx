// src/lib/emit-rooms.ts
import prisma from "@/lib/prisma";
import { pusherServer } from "@/lib/pusher-server";

/**
 * Emite el índice global (listado compacto) a:
 *   - public-rooms  (usuarios)
 *   - private-rooms (admin)
 */
export async function emitRoomsIndex() {
  const rooms = await prisma.room.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      state: true,
      gameType: true,
      priceCents: true,
      capacity: true,
      currentRound: true, // Need this to filter
    },
  });

  const payload = await Promise.all(rooms.map(async (r) => {
    const currentRound = (r as any).currentRound ?? 1;
    const count = await prisma.entry.count({
      where: { roomId: r.id, round: currentRound }
    });

    return {
      id: r.id,
      title: r.title,
      state: r.state,
      gameType: r.gameType,
      priceCents: r.priceCents,
      capacity: r.capacity,
      slots: {
        taken: count,
        free: Math.max(0, r.capacity - count),
      },
    };
  }));

  await Promise.all([
    pusherServer.trigger("public-rooms", "rooms:index", payload),
    pusherServer.trigger("private-rooms", "rooms:index", payload),
  ]);
}

/**
 * Emite la sala a su canal privado.
 * Optimizacion: Enviamos señal de "invalidación" para que el cliente haga fetch.
 * Esto evita payload > 10KB en salas grandes y asegura estado consistente.
 */
export async function emitRoomUpdate(roomId: string, _payload?: any) {
  await pusherServer.trigger(
    `private-room-${roomId}`,
    "room:update",
    { id: roomId, refresh: true }
  );
}
