// src/lib/pusher-client.ts
import PusherJS from "pusher-js";

const key = process.env.NEXT_PUBLIC_PUSHER_KEY!;
const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1";

// Evita duplicados en dev con hot-reload
declare global {
  // eslint-disable-next-line no-var
  var _pusherClient: PusherJS | undefined;
}

export const pusherClient =
  globalThis._pusherClient ||
  new PusherJS(key, {
    cluster,
    forceTLS: true,
    // 👇 IMPORTANTE: endpoint de auth para canales privados
    authEndpoint: "/api/pusher/auth",
    // Si usas NextAuth en el mismo dominio, no hace falta headers extra.
    // auth: { headers: { } },
  });

if (!globalThis._pusherClient) {
  globalThis._pusherClient = pusherClient;
}

// ✅ Exportación por defecto (además de la nombrada)
export default pusherClient;
