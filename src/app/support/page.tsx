// src/app/support/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import pusherClient from "@/lib/pusher-client";

// ---- Tipos ----
type Thread = {
  id: string;
  subject: string;
  status: "open" | "closed" | string;
  lastMessageAt: string;
  createdAt: string;
};

type Message = {
  id: string;
  senderRole: "user" | "admin" | "guest" | string;
  senderId: string | null;
  content: string;
  createdAt: string;
};

// ---- Utils ----
const timeAgo = (iso: string) => {
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
    const days = Math.round(hours / 24);
    return rtf.format(-days, "day");
  } catch {
    return new Date(iso).toLocaleString();
  }
};

async function safeJson<T = any>(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, { cache: "no-store", ...init });
  let data: any = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

export default function SupportPage() {
  const { status, data } = useSession();
  const isGuest = status !== "authenticated";
  const userId = (data as any)?.user?.id as string | undefined;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");

  // invitado
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");

  const [loading, setLoading] = useState(false);

  const msgsRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [atBottom, setAtBottom] = useState(true);
  const onScroll = () => {
    const el = msgsRef.current;
    if (!el) return;
    const threshold = 24;
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setAtBottom(isBottom);
  };
  const scrollToBottom = () => {
    const el = msgsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const activeThread = useMemo(() => threads.find(t => t.id === activeId) || null, [threads, activeId]);

  // Persiste último hilo invitado en esta pestaña
  useEffect(() => {
    if (!isGuest) return;
    const saved = window.sessionStorage.getItem("guestThread");
    const savedEmail = window.sessionStorage.getItem("guestEmail");
    if (saved && savedEmail) {
      setActiveId(saved);
      setGuestEmail(savedEmail);
    }
  }, [isGuest]);

  // Cargar hilos (solo auth)
  const loadThreads = async () => {
    if (isGuest) return;
    try {
      const list = await safeJson<Thread[]>("/api/support/threads");
      setThreads(list);
    } catch (e) {
      console.error(e);
    }
  };

  // Cargar mensajes (auth o guest)
  const loadMessages = async (id: string) => {
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (isGuest) {
        if (!guestEmail) return;
        const r = await fetch(`/api/support/guest/${id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: guestEmail }),
          signal: controller.signal,
        });
        const d = await r.json().catch(() => []);
        if (!r.ok) throw new Error((d as any)?.error || "No se pudo cargar");
        setMessages(d as Message[]);
      } else {
        const r = await fetch(`/api/support/threads/${id}/messages`, { cache: "no-store", signal: controller.signal });
        const d = await r.json().catch(() => []);
        if (!r.ok) throw new Error((d as any)?.error || "No se pudo cargar");
        setMessages(d as Message[]);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    }
  };

  // Polling ligero y on-visibility
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadThreads();
      if (activeId) loadMessages(activeId);
    };
    tick();
    const t = setInterval(tick, 4000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, isGuest, guestEmail]);

  // ---- Suscripción Realtime (Pusher) ----
  useEffect(() => {
    if (!activeId) return;

    let sub: any = null;
    let fallbackSub: any = null;

    const handleNew = (m: Message) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      // autoscroll solo si estabas abajo
      requestAnimationFrame(() => {
        if (msgsRef.current && atBottom) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
      });
    };

    const handleStatus = (_s: { status: "open" | "closed" | string }) => {};

    try {
      sub = pusherClient.subscribe(`private-support-thread-${activeId}`);
      sub.bind("message:new", handleNew);
      sub.bind("thread:status", handleStatus);

      if (isGuest) {
        fallbackSub = pusherClient.subscribe(`public-support-thread-${activeId}`);
        fallbackSub.bind("message:new", handleNew);
        fallbackSub.bind("thread:status", handleStatus);
      }
    } catch (e) {
      console.warn("Pusher subscribe error", e);
    }

    return () => {
      try {
        if (sub) {
          sub.unbind("message:new", handleNew);
          sub.unbind("thread:status", handleStatus);
          pusherClient.unsubscribe(`private-support-thread-${activeId}`);
        }
        if (fallbackSub) {
          fallbackSub.unbind("message:new", handleNew);
          fallbackSub.unbind("thread:status", handleStatus);
          pusherClient.unsubscribe(`public-support-thread-${activeId}`);
        }
      } catch {}
    };
  }, [activeId, isGuest, atBottom]);

  // Autoscroll al cambiar mensajes (si estabas al fondo)
  useEffect(() => {
    if (msgsRef.current && atBottom) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages, activeId, atBottom]);

  const createThread = async () => {
    if (!subject.trim()) return alert("Escribe un asunto");

    const body: any = {
      subject: subject.trim(),
      firstMessage: text.trim() || "Hola, necesito ayuda con mi cuenta",
    };

    if (isGuest) {
      if (!guestEmail.trim()) return alert("Debes ingresar tu correo para crear el chat");
      body.guestEmail = guestEmail.trim();
      if (guestName.trim()) body.guestName = guestName.trim();
    }

    setLoading(true);
    try {
      const d = await safeJson<{ id: string }>("/api/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setSubject("");
      setText("");

      if (isGuest) {
        setActiveId(d.id);
        window.sessionStorage.setItem("guestThread", d.id);
        window.sessionStorage.setItem("guestEmail", body.guestEmail);
        await loadMessages(d.id);
        alert("¡Chat creado! Mantén abierta esta página para ver respuestas en tiempo real.");
      } else {
        await loadThreads();
        setActiveId(d.id);
        await loadMessages(d.id);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!activeId) return;
    const content = text.trim();
    if (!content) return;

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      senderRole: isGuest ? "guest" : "user",
      senderId: userId || null,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setAtBottom(true);

    setLoading(true);
    try {
      if (isGuest) {
        await safeJson(`/api/support/guest/${activeId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: guestEmail, content }),
        });
      } else {
        await safeJson(`/api/support/threads/${activeId}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
      }
      await loadMessages(activeId);
      await loadThreads();
    } catch (e: any) {
      alert(e.message || "No se pudo enviar");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Render mensajes: si content es JSON de acción, mostrar botón
  const renderMessageContent = (content: string) => {
    try {
      const obj = JSON.parse(content);
      if (obj?.type === "action" && obj?.action === "reset_password" && obj?.url) {
        return (
          <a
            href={obj.url}
            className="inline-flex items-center justify-center text-xs sm:text-sm px-3 py-1.5 rounded border border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20 transition"
          >
            {obj.label || "Restablecer contraseña"}
          </a>
        );
      }
    } catch {}
    return <div>{content}</div>;
  };

  return (
    <main className="max-w-6xl mx-auto px-3 py-6 grid gap-4 md:grid-cols-[260px_1fr]">
      <aside className="card space-y-3">
        <h2 className="font-semibold">Soporte</h2>

        {isGuest ? (
          <div className="text-sm opacity-80">
            Estás creando un chat como <strong>invitado</strong>. Ingresa tu correo para que podamos ubicarte y responderte.
          </div>
        ) : threads.length === 0 ? (
          <div className="text-sm opacity-70">Sin chats aún.</div>
        ) : (
          <div className="space-y-2">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => { setActiveId(t.id); loadMessages(t.id); }}
                className={`w-full text-left border rounded px-3 py-2 text-sm ${activeId === t.id ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{t.subject}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${t.status === "open" ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"}`}>
                    {String(t.status).toUpperCase()}
                  </span>
                </div>
                <div className="text-[11px] opacity-70 truncate">{timeAgo(t.lastMessageAt)}</div>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-white/10 pt-3">
          <h3 className="font-medium text-sm mb-1">Nuevo chat</h3>

          {isGuest && (
            <>
              <input
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="Tu correo (invitado)"
                className="w-full bg-transparent border rounded px-3 py-2 text-sm mb-2"
                type="email"
              />
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="w-full bg-transparent border rounded px-3 py-2 text-sm mb-2"
              />
            </>
          )}

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Asunto (p.ej. Cambio de clave)"
            className="w-full bg-transparent border rounded px-3 py-2 text-sm mb-2"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe tu mensaje"
            className="w-full bg-transparent border rounded px-3 py-2 text-sm mb-2 min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button disabled={loading} onClick={createThread} className="btn btn-primary w-full disabled:opacity-50">
            {loading ? "Creando…" : "Crear chat"}
          </button>
        </div>
      </aside>

      <section className="card flex flex-col">
        {isGuest && !activeId ? (
          <div className="text-sm opacity-80">
            Como invitado no tienes historial. Al crear tu chat, mantén esta página abierta: verás aquí la respuesta del admin.
          </div>
        ) : !activeId ? (
          <div className="text-sm opacity-70">Selecciona un chat o crea uno nuevo.</div>
        ) : (
          <>
            {/* Contenedor fijo con scroll */}
            <div
              ref={msgsRef}
              onScroll={onScroll}
              className="relative space-y-2 overflow-auto rounded border border-white/10 p-2
                         h-[360px] sm:h-[420px] md:h-[480px]"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${
                    (isGuest ? m.senderRole === "guest" : m.senderRole === "user")
                      ? "bg-white/10 self-end ml-auto"
                      : "bg-white/5"
                  }`}
                >
                  <div className="text-[11px] opacity-70 mb-1">
                    {m.senderRole.toUpperCase()} · {new Date(m.createdAt).toLocaleString()}
                  </div>
                  {renderMessageContent(m.content)}
                </div>
              ))}

              {!atBottom && (
                <div className="pointer-events-none sticky bottom-2 flex justify-center">
                  <button
                    onClick={scrollToBottom}
                    className="pointer-events-auto text-xs rounded-full px-3 py-1 border border-white/20 bg-black/40 backdrop-blur"
                    title="Ir al último"
                  >
                    Ir al último ↓
                  </button>
                </div>
              )}
            </div>

            <div className="pt-3 flex items-center gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe un mensaje (Enter para enviar)"
                className="flex-1 bg-transparent border rounded px-3 py-2 text-sm h-10 min-h-[40px] max-h-[160px] resize-y"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button onClick={sendMessage} className="btn">Enviar</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
