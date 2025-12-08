// src/app/api/rooms/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";
import prisma from "@/modules/ui/lib/prisma";
import { generateServerSeed, generateHash } from "@/modules/games/shared/lib/provably-fair";
import { checkAndMaintenanceRoom } from "@/modules/rooms/lib/game-maintenance";

const ROOM_STATES = ["OPEN", "LOCKED", "FINISHED"] as const;
const GAME_TYPES = ["ROULETTE", "DICE_DUEL"] as const;

const ALLOWED_TIERS = new Set([100, 500, 1000, 2000, 5000, 10000]);

const createSchema = z.object({
  priceCents: z.number().int().positive(),
  capacity: z.number().int().min(2).max(100).optional(),
  title: z.string().min(1).optional(),
  gameType: z.enum(GAME_TYPES).optional().default("ROULETTE"),
  botWaitMs: z.number().int().min(0).optional().default(0), // 👈 Added
});

// GET /api/rooms?state=&gameType=&take=
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    const userId = (session?.user as any)?.id as string | undefined;

    const { searchParams } = new URL(req.url);
    const qState = searchParams.get("state") ?? undefined;
    const qGameType = searchParams.get("gameType") ?? undefined;
    const qTake = searchParams.get("take") ?? undefined;

    const q = z.object({
      state: z.enum(ROOM_STATES).optional(),
      gameType: z.enum(GAME_TYPES).optional(),
      take: z.coerce.number().int().positive().max(100).optional(),
    }).parse({ state: qState, gameType: qGameType, take: qTake });

    const where: Record<string, any> = { deletedAt: null };
    if (q.state) where.state = q.state;
    if (q.gameType) where.gameType = q.gameType;

    if (q.state === "FINISHED" && role !== "admin") {
      if (!userId) return NextResponse.json([]);
      where.entries = { some: { userId } };
    }

    const rooms = await prisma.room.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: q.take ?? 30,
    });

    // 🔒 LAZY LOCKING & MAINTENANCE
    // Check if any room has expired and needs maintenance (Lock, Bot Fill, Finish, or Extend)
    await Promise.all(rooms.map(async (r) => {
      // Logic moved to shared helper
      await checkAndMaintenanceRoom(r);
    }));

    // Fix: Count entries only for the CURRENT round of each room
    const data = await Promise.all(rooms.map(async (r) => {
      const currentRound = (r as any).currentRound ?? 1;
      const count = await prisma.entry.count({
        where: { roomId: r.id, round: currentRound }
      });

      return {
        id: r.id,
        title: r.title,
        priceCents: r.priceCents,
        state: r.state,
        capacity: r.capacity,
        createdAt: r.createdAt,
        gameType: r.gameType,
        slots: { taken: count, free: Math.max(0, r.capacity - count) },
        autoLockAt: r.autoLockAt,
      };
    }));

    return NextResponse.json(data);
  } catch (e) {
    console.error("rooms GET error:", e);
    return NextResponse.json({ error: "No se pudieron listar salas" }, { status: 500 });
  }
}

// POST /api/rooms
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin" && role !== "god") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = createSchema.parse(await req.json());

    if (!ALLOWED_TIERS.has(body.priceCents)) {
      return NextResponse.json({ error: "priceCents no permitido" }, { status: 400 });
    }

    const capacity = body.capacity ?? (body.gameType === "DICE_DUEL" ? 2 : 12);

    const title =
      body.title ??
      (body.gameType === "DICE_DUEL"
        ? `Dados $${(body.priceCents / 100).toFixed(0)} (1v1)`
        : `Ruleta $${(body.priceCents / 100).toFixed(0)} (${capacity} puestos)`);

    const serverSeed = generateServerSeed();
    const serverHash = generateHash(serverSeed);

    const room = await prisma.room.create({
      data: {
        title,
        priceCents: body.priceCents,
        capacity,
        state: "OPEN",
        gameType: body.gameType,
        currentServerSeed: serverSeed,
        currentServerHash: serverHash,
        botWaitMs: body.botWaitMs, // 👈 Added
      },
      include: { _count: { select: { entries: true } } },
    });

    // 👇 realtime índice
    await emitRoomsIndex();

    return NextResponse.json({
      id: room.id,
      title: room.title,
      priceCents: room.priceCents,
      state: room.state,
      capacity: room.capacity,
      createdAt: room.createdAt,
      gameType: room.gameType,
      slots: { taken: room._count.entries, free: room.capacity - room._count.entries },
    });
  } catch (e) {
    console.error("rooms POST error:", e);
    return NextResponse.json({ error: "No se pudo crear la sala" }, { status: 500 });
  }
}
