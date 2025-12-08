// src/lib/realtime-withdrawals.ts
import { pusherServer } from "@/modules/ui/lib/pusher-server";

type WStatus = "pending" | "finished" | "rejected";

export async function emitAdminWithdrawalCreated(payload: {
  id: string;
  user: { email: string; name?: string | null };
  amountCents: number;
  wallet: string;
  status: WStatus;
  createdAt: string;
}) {
  // Canal público para el panel admin
  await pusherServer.trigger("admin-withdrawals", "withdrawals:created", payload);
}

export async function emitAdminWithdrawalChanged(payload: {
  id: string;
  status: WStatus;
}) {
  await pusherServer.trigger("admin-withdrawals", "withdrawals:changed", payload);
}

// (Opcional) notificación al usuario dueño del retiro:
export async function emitUserWithdrawalUpdated(userId: string, payload: {
  id: string;
  status: WStatus;
}) {
  await pusherServer.trigger(`private-user-${userId}`, "withdrawal:updated", payload);
}

