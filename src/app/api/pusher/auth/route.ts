// src/app/api/pusher/auth/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher-server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any | undefined;
  const userId = user?.id as string | undefined;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const form = await req.formData();
  const socketId = form.get("socket_id") as string;
  const channelName = form.get("channel_name") as string;

  // Autorizaciones por canal privado
  //  - private-user-{userId} -> solo dueño
  //  - private-room-{id}     -> cualquier user autenticado
  //  - private-rooms         -> solo admin (panel)
  const isUserChannel =
    channelName?.startsWith("private-user-") &&
    channelName === `private-user-${userId}`;

  const isRoomChannel = channelName?.startsWith("private-room-");

  const isAdminRooms = channelName === "private-rooms" && (user?.role === "admin" || user?.role === "god");

  if (!(isUserChannel || isRoomChannel || isAdminRooms)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const auth = pusherServer.authorizeChannel(socketId, channelName);
  return NextResponse.json(auth);
}
