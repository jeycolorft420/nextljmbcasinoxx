// src/lib/realtime.ts
import { pusherServer } from "@/modules/ui/lib/pusher-server";

export async function emitToUser(userId: string, event: string, payload: any) {
  await pusherServer.trigger(`user-${userId}`, event, payload);
}

export async function emitWalletBalance(userId: string, balanceCents: number) {
  await emitToUser(userId, "wallet:balance", { balanceCents });
}

export async function emitTransferEvent(
  userId: string,
  transfer: {
    id: string;
    amountCents: number;
    note?: string | null;
    createdAt: string | Date;
    direction: "in" | "out";
    counterparty: string;
  }
) {
  await emitToUser(userId, "transfer:new", transfer);
}

export async function emitWithdrawalUpdated(userId: string, w: {
  id: string;
  amountCents: number;
  wallet: string;
  status: "pending" | "finished" | "rejected";
  createdAt: string | Date;
}) {
  await emitToUser(userId, "withdrawal:updated", w);
}

/** Canal global del panel admin de retiros */
export async function emitAdminWithdrawalsUpdated(payload: any) {
  await pusherServer.trigger("admin-withdrawals", "withdrawals:changed", payload);
}

/** Pagos confirmados */
export async function emitPaymentFinished(userId: string, p: {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string | Date;
  orderId: string;
}) {
  await emitToUser(userId, "payment:finished", p);
}

