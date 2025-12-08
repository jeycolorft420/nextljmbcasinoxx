// src/app/admin/support/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Types
type Thread = {
  id: string;
  subject: string;
  status: "open" | "closed" | string;
  user?: { email: string | null; name: string | null } | null;
  guestEmail?: string | null;
  guestName?: string | null;
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

// Helpers
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

export default function AdminSupportPage() {
  // ---- estado base ----
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [statusUpdating, setStatusUpdating] = useState(false);

  // ---- generar link reset ----
  const [emailForReset, setEmailForReset] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  // ---- búsqueda de cerrados por email ----
  const [searchEmail, setSearchEmail] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [closedResults, setClosedResults] = useState<Thread[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const msgsRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // UI: botón “Ir al final”
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

  // Derivados
  const openThreads = useMemo(
    () => threads.filter(t => t.status === "open"),
    [threads]
  );
  const activeThread = useMemo(
    () => threads.find(t => t.id === activeId) || null,
    [threads, activeId]
  );

  // Persist selected thread across refreshes
  useEffect(() => {
    const saved = localStorage.getItem("admin-support:activeId");
    if (saved) setActiveId(saved);
  }, []);
  useEffect(() => {
    if (activeId) localStorage.setItem("admin-support:activeId", activeId);
  }, [activeId]);

  // Loaders
  const loadThreads = async () => {
    try {
      const data = await safeJson<Thread[]>("/api/admin/support/threads");
      setThreads(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadMessages = async (id: string) => {
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await fetch(`/api/support/threads/${id}/messages`, { cache: "no-store", signal: controller.signal });
      let data: any = [];
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error || "No se pudo cargar");
      setMessages(data as Message[]);
    } catch (e) {
      if ((e as any)?.name !== "AbortError") console.error(e);
    }
  };

  // Polling ligero + visibilidad (refresca abiertos y el hilo activo)
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadThreads();
      if (activeId) loadMessages(activeId);
    };
    tick();
    const t = setInterval(tick, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeId]);

  // Auto-scroll a bottom si estabas abajo
  useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, activeId, atBottom]);

  // Actions: responder / cambiar estado
  const reply = async () => {
    if (!activeId || !text.trim()) return;
    const content = text.trim();

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      senderRole: "admin",
      senderId: null,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    setAtBottom(true);

    try {
      await safeJson(`/api/admin/support/threads/${activeId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await loadMessages(activeId);
      await loadThreads();
    } catch (e: any) {
      alert(e.message || "No se pudo enviar");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  };

  const setStatus = async (status: "open" | "closed") => {
    if (!activeId) return;
    setStatusUpdating(true);
    try {
      await safeJson(`/api/admin/support/threads/${activeId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadThreads();
    } catch (e: any) {
      alert(e.message || "No se pudo actualizar");
    } finally {
      setStatusUpdating(false);
    }
  };

  // ✅ Genera y envía botón de reset en el chat (no texto copiable)
  const generateResetLink = async () => {
    if (!activeId) return;
    const email = emailForReset.trim();
    if (!email) return alert("Ingresa el correo del usuario.");
    setGenLoading(true);
    try {
      const d = await safeJson<{ url: string }>("/api/admin/auth/reset/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = {
        type: "action",
        action: "reset_password",
        url: d.url,
        label: "Restablecer contraseña",
      };

      await safeJson(`/api/admin/support/threads/${activeId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(payload) }),
      });

      await loadMessages(activeId);
      alert("Botón de restablecer contraseña enviado al chat ✅");
    } catch (e: any) {
      alert(e.message || "No se pudo generar/enviar el botón de clave");
    } finally {
      setGenLoading(false);
    }
  };

  // ---- Buscar cerrados por email (solo al hacer clic o Enter) ----
  const searchClosedByEmail = async (q: string) => {
    const email = q.trim();
    if (!email) {
      setClosedResults([]);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const data = await safeJson<Thread[]>(
        `/api/admin/support/threads?status=closed&q=${encodeURIComponent(email)}`
      );
      setClosedResults(data);
    } catch (e: any) {
      setClosedResults([]);
      setSearchError(e?.message || "No se pudo buscar.");
    } finally {
      setSearchLoading(false);
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
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center text-xs sm:text-sm px-3 py-1.5 rounded border border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20 transition"
          >
            {obj.label || "Restablecer contraseña"}
          </a>
        );
      }
    } catch {}
    return <div>{content}</div>;
  };

  // UI bits
  const StatusBadge = ({ s }: { s: Thread["status"] }) => (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
        s === "open" ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s === "open" ? "bg-emerald-400" : "bg-rose-400"}`} />
      {String(s).toUpperCase()}
    </span>
  );

  const renderThreadButton = (t: Thread) => {
    const displayName = t.user?.name || t.user?.email || t.guestName || t.guestEmail || "Usuario";
    return (
      <button
        key={t.id}
        onClick={() => { setActiveId(t.id); loadMessages(t.id); }}
        className={`w-full text-left border rounded px-3 py-2 text-sm transition ${
          activeId === t.id ? "bg-white/10 border-white/20" : "hover:bg-white/5 border-white/10"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium truncate">{t.subject}</div>
          <StatusBadge s={t.status} />
        </div>
        <div className="text-[11px] opacity-70 truncate">
          {displayName} · {timeAgo(t.lastMessageAt)}
        </div>
      </button>
    );
  };

  return (
    <main className="max-w-7xl mx-auto px-3 py-6 grid gap-4 md:grid-cols-[360px_1fr]">
      {/* Sidebar */}
      <aside className="card space-y-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Soporte (Admin)</h2>
          <button onClick={loadThreads} className="btn btn-ghost text-xs">Actualizar</button>
        </div>

        {/* Buscador de cerrados por email */}
        <div className="rounded border border-white/10 p-2 space-y-2">
          <label className="text-xs opacity-80">Buscar <b>cerrados</b> por email</label>
          <div className="flex gap-2">
            <input
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="correo@dominio.com"
              className="flex-1 bg-transparent border rounded px-3 py-2 text-sm"
              type="email"
              onKeyDown={(e) => { if (e.key === "Enter") searchClosedByEmail(searchEmail); }}
            />
            <button
              onClick={() => searchClosedByEmail(searchEmail)}
              className="btn"
              disabled={searchLoading}
            >
              {searchLoading ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {searchError && <div className="text-[11px] text-rose-400">{searchError}</div>}
        </div>

        {/* Abiertos (siempre visibles) */}
        <div className="space-y-2">
          <div className="text-xs opacity-70">Abiertos ({openThreads.length})</div>
          <div className="space-y-2 max-h-[30vh] overflow-auto pr-1">
            {openThreads.length === 0 ? (
              <div className="text-sm opacity-70">Sin chats abiertos.</div>
            ) : (
              openThreads.map(renderThreadButton)
            )}
          </div>
        </div>

        {/* Resultados de cerrados (por email) */}
        <div className="space-y-2">
          <div className="text-xs opacity-70">Cerrados encontrados ({closedResults.length})</div>
          <div className="space-y-2 max-h-[30vh] overflow-auto pr-1">
            {closedResults.length === 0 ? (
              <div className="text-sm opacity-60">Escribe un email y pulsa “Buscar”.</div>
            ) : (
              closedResults.map(renderThreadButton)
            )}
          </div>
        </div>
      </aside>

      {/* Conversación */}
      <section className="card flex flex-col">
        {!activeId ? (
          <div className="text-sm opacity-70">Selecciona un chat.</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-xs opacity-70">ID: {activeId}</div>
              <div className="flex gap-2">
                <button disabled={statusUpdating} onClick={() => setStatus("open")} className="btn btn-ghost">
                  Abrir
                </button>
                <button disabled={statusUpdating} onClick={() => setStatus("closed")} className="btn btn-ghost">
                  Cerrar
                </button>
              </div>
            </div>

            {/* Generar botón de reseteo (envía al chat) */}
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="email"
                value={emailForReset}
                onChange={(e) => setEmailForReset(e.target.value)}
                placeholder="Correo del usuario para enviar botón de clave"
                className="bg-transparent border rounded px-3 py-2 text-sm"
              />
              <button
                disabled={genLoading}
                onClick={generateResetLink}
                className="btn sm:w-auto w-full disabled:opacity-50"
              >
                {genLoading ? "Enviando…" : "Enviar botón de clave"}
              </button>
            </div>

            {/* Messages: contenedor fijo con scroll */}
            <div
              ref={msgsRef}
              onScroll={onScroll}
              className="relative space-y-2 overflow-auto rounded border border-white/10 p-2
                         h-[360px] sm:h-[420px] md:h-[520px]"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.senderRole === "admin" ? "bg-white/10 self-end ml-auto" : "bg-white/5"
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

            {/* Composer */}
            <div className="pt-3 flex items-center gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Responder… (Enter para enviar, Shift+Enter para salto)"
                className="flex-1 bg-transparent border rounded px-3 py-2 text-sm h-10 min-h-[40px] max-h-[160px] resize-y"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    reply();
                  }
                }}
              />
              <button onClick={reply} className="btn">Enviar</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

