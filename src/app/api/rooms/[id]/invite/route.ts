// src/app/api/rooms/[id]/invite/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { makeInvitePayload, signInvite } from "@/lib/invite";
import prisma from "@/lib/prisma";
const Param = z.object({ id: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { id } = Param.parse(await ctx.params);

    // Cargar sala + participante actual
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        entries: { include: { user: true }, orderBy: { position: "asc" } },
      },
    });

    if (!room) return NextResponse.json({ error: "Sala no encontrada" }, { status: 404 });
    if (room.gameType !== "DICE_DUEL") {
      return NextResponse.json({ error: "La invitación sólo aplica a Dados 1v1" }, { status: 400 });
    }
    if (room.capacity !== 2) {
      return NextResponse.json({ error: "La sala debe ser 1v1 (capacidad 2)" }, { status: 400 });
    }

    // Debe haber 0 o 1 jugador y yo debo ser el que está dentro (si hay 1)
    const meEntry = room.entries.find((e) => e.user.email === session.user!.email) ?? null;
    if (room.entries.length >= 2) {
      return NextResponse.json({ error: "La sala ya está completa" }, { status: 409 });
    }
    if (room.entries.length === 1 && !meEntry) {
      return NextResponse.json({ error: "Sólo el jugador de la sala puede invitar" }, { status: 403 });
    }

    const inviterId =
      meEntry?.userId ??
      (await prisma.user.findUnique({
        where: { email: session.user.email! },
        select: { id: true },
      }))?.id ??
      undefined;

    // Crear token con expiración (ej. 15 min)
    const payload = makeInvitePayload({ roomId: room.id, inviterId, minutes: 15 });
    const token = signInvite(payload);

    // Construir URL absoluta
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.headers.get("x-forwarded-origin") ||
      req.headers.get("origin") ||
      "";

    const url = `${origin}/invite/${token}`;

    return NextResponse.json({
      ok: true,
      token,
      inviteUrl: url,
      expiresAt: payload.exp,
    });
  } catch (e: any) {
    console.error("invite error:", e?.message || e);
    return NextResponse.json({ error: "No se pudo generar la invitación" }, { status: 500 });
  }
}
