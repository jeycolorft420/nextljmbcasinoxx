// src/lib/room-payload.ts
import { PrismaClient } from "@prisma/client";

export async function buildRoomPayload(prisma: PrismaClient, roomId: string) {
  const roomHeader = await prisma.room.findUnique({ where: { id: roomId } });
  if (!roomHeader) return null;

  const currentRound = (roomHeader as any).currentRound ?? 1;
  const isDiceDuel = roomHeader.gameType === "DICE_DUEL";

  console.log("📦 PAYLOAD DEBUG:", {
    id: roomId,
    type: roomHeader.gameType,
    isDiceDuel,
    round: currentRound
  });

  const entries = await prisma.entry.findMany({
    where: {
      roomId,
      ...(isDiceDuel ? {} : { round: currentRound })
    },
    orderBy: { position: "asc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          selectedDiceColor: true,
        },
      },
    },
  });

  console.log("📦 PAYLOAD ENTRIES:", entries.length);

  const room = { ...roomHeader, entries };

  return {
    id: room.id,
    title: room.title,
    priceCents: room.priceCents,
    state: room.state,
    capacity: room.capacity,
    createdAt: room.createdAt,
    lockedAt: room.lockedAt,
    finishedAt: room.finishedAt,

    prizeCents: room.prizeCents ?? null,
    winningEntryId: room.winningEntryId ?? null,

    gameType: room.gameType,
    gameMeta: (room as any).gameMeta ?? null,
    currentRound: (room as any).currentRound ?? 1,

    // 🛡️ Provably Fair Public Data
    currentServerHash: (room as any).currentServerHash ?? null,
    currentServerSeed: room.state === "FINISHED" ? (room as any).currentServerSeed : null,

    counts: {
      taken: room.entries.length,
      free: room.capacity - room.entries.length,
    },
    // slots removed to save bandwidth (frontend calculates it)
    entries: room.entries.map((e) => ({
      id: e.id,
      position: e.position,
      user: {
        id: e.user.id,
        name: e.user.name,
        email: e.user.email,
        selectedDiceColor: e.user.selectedDiceColor ?? null,
      },
    })),
  };
}
