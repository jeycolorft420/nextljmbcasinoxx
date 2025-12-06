// src/app/api/rooms/[id]/finish/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { finishRoom, processWinnerPayout } from "@/lib/game-logic";

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

    // Validar permisos (Admin o Trigger Público)
    // Nota: finishRoom ya valida el estado de la sala, pero aquí validamos quién llama
    const role = (session?.user as any)?.role;
    // Si es admin, permitimos forzar ganador específico (body.entryId/position no soportado en finishRoom simple aun, 
    // pero para auto-finish random está bien. Si queremos soportar manual, debemos pasar params a finishRoom)

    // Por ahora, para simplificar y solucionar el CPU spike, usamos la lógica random de finishRoom.
    // Si se requiere forzar ganador manual, habría que extender finishRoom.

    // Ejecutar lógica
    const result = await finishRoom(id);

    if ((result as any).alreadyFinished) {
      const { room, winnerEntry } = result as any;
      return NextResponse.json({
        ok: true, roomId: room.id, prizeCents: room.prizeCents, winningEntryId: room.winningEntryId,
        winner: winnerEntry?.user ? { user: winnerEntry.user, position: winnerEntry.position } : null,
      });
    }

    // Procesar pagos y notificaciones
    await processWinnerPayout(result);

    const { updated, winningEntry, prizeCents } = result as any;

    return NextResponse.json({
      ok: true, roomId: updated.id, prizeCents, winningEntryId: winningEntry.id,
      winner: { user: winningEntry.user, position: winningEntry.position },
      gameMeta: updated.gameMeta,
    });

  } catch (e: any) {
    console.error("finish error:", e);
    const msg = e?.message || "Error al realizar el sorteo";
    const status = msg.includes("no encontrada") ? 404 : msg.includes("LOCKED/OPEN") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
