// src/app/invite/[token]/page.tsx
import { verifyInvite } from "@/modules/auth/lib/invite";
import Link from "next/link";
import JoinButton from "./join-button";
import prisma from "@/modules/ui/lib/prisma";

type Props = {
  params: { token: string };
};

/**
 * Página de aceptación de invitación.
 * - Valida token (firma y expiración)
 * - Muestra info básica de la sala
 * - CTA para unirse (POST /api/rooms/[id]/join con quantity: 1)
 * - Si la sala ya está completa o cerrada, lo avisa
 */
export default async function InvitePage({ params }: Props) {
  const token = params.token;
  const data = verifyInvite(token);

  if (!data) {
    return (
      <main className="max-w-xl mx-auto px-3 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Invitación inválida o expirada</h1>
        <p className="opacity-75">Solicita a tu amigo que te envíe una nueva invitación.</p>
        <Link href="/rooms" className="btn mt-4">Ver salas</Link>
      </main>
    );
  }

  // Cargar sala para mostrar datos actualizados
  const room = await prisma.room.findUnique({
    where: { id: data.roomId },
    include: {
      entries: { include: { user: true }, orderBy: { position: "asc" } },
    },
  });

  if (!room) {
    return (
      <main className="max-w-xl mx-auto px-3 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Sala no encontrada</h1>
        <p className="opacity-75">Es posible que haya sido eliminada.</p>
        <Link href="/rooms" className="btn mt-4">Ver salas</Link>
      </main>
    );
  }

  const taken = room.entries.length;
  const free = Math.max(0, room.capacity - taken);

  const inviter =
    data.inviterId
      ? room.entries.find(e => e.userId === data.inviterId)?.user
      : null;

  const canJoin =
    room.gameType === "DICE_DUEL" &&
    room.capacity === 2 &&
    free > 0 &&
    (room.state === "OPEN" || room.state === "LOCKED" || room.state === "FINISHED");

  return (
    <main className="max-w-xl mx-auto px-3 py-8">
      <div className="card">
        <h1 className="text-xl sm:text-2xl font-bold">{room.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm opacity-80">
          <span className="badge">Dados 1v1</span>
          <span className="badge">${room.priceCents / 100}</span>
          <span className="badge">{taken}/{room.capacity} ocupados</span>
        </div>

        {inviter && (
          <p className="mt-3 text-sm">
            Te invita: <span className="font-medium">{inviter.name || inviter.email}</span>
          </p>
        )}

        <p className="mt-2 text-sm opacity-80">
          Esta invitación vence pronto. Si no puedes entrar ahora, pídele a tu amigo un link nuevo.
        </p>

        <div className="mt-4">
          {canJoin ? (
            <JoinButton roomId={room.id} />
          ) : (
            <div className="btn w-full cursor-default opacity-70">
              {free === 0 ? "La sala está completa" : "No disponible"}
            </div>
          )}
        </div>

        <div className="mt-3 text-center">
          <Link href={`/rooms/${room.id}`} className="text-sm underline opacity-80">
            Ver sala
          </Link>
        </div>
      </div>
    </main>
  );
}

