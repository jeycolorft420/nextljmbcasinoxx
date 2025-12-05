// src/lib/pusher-server.ts
import Pusher from "pusher";

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,           // ej: "123456"
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,    // misma key pública del cliente
  secret: process.env.PUSHER_SECRET!,          // tu secret
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1",
  useTLS: true,
});
