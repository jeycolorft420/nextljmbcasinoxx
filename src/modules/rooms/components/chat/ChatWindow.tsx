"use client";

import { useEffect, useRef, useState } from "react";
import { pusherClient } from "@/modules/ui/lib/pusher-client";
import { useSession } from "next-auth/react";
import { format } from "date-fns";

type Message = {
    id: string;
    content: string;
    createdAt: string | Date;
    user: {
        id: string;
        name: string | null;
        email: string;
    };
};

type Props = {
    roomId: string;
    className?: string;
    compact?: boolean;
    activePlayerIds?: string[];
};

export default function ChatWindow({ roomId, className = "", compact = false, activePlayerIds = [] }: Props) {
    const { data: session } = useSession();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Fetch inicial de historial
    useEffect(() => {
        if (!roomId) return;
        fetch(`/api/rooms/${roomId}/chat`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setMessages(data);
            })
            .catch(e => console.error("Chat load error", e));
    }, [roomId]);

    // Suscripción Pusher
    useEffect(() => {
        if (!roomId) return;
        const channelName = `private-room-${roomId}`;
        const channel = pusherClient.subscribe(channelName);

        const onMessage = (msg: Message) => {
            setMessages((prev) => {
                if (prev.find(m => m.id === msg.id)) return prev;
                return [...prev, msg].slice(-50);
            });
        };

        channel.bind("chat:message", onMessage);

        return () => {
            channel.unbind("chat:message", onMessage);
        };
    }, [roomId]);

    const send = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || sending) return;

        setSending(true);
        const content = inputValue;
        setInputValue(""); // Optimista

        try {
            await fetch(`/api/rooms/${roomId}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={`flex flex-col bg-base-300 rounded-lg overflow-hidden border border-white/5 h-full ${className}`}>
            {/* Header */}
            <div className="bg-base-200 px-3 py-2 text-xs font-bold uppercase tracking-wider opacity-70 border-b border-white/5 flex justify-between items-center">
                <span>Chat de Sala</span>
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{messages.length}</span>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[400px] sm:max-h-none scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
            >
                {messages.length === 0 && (
                    <div className="text-center text-xs opacity-30 mt-10">
                        ¡Di hola! 👋
                    </div>
                )}
                {messages.map((msg) => {
                    const isMe = session?.user?.email === msg.user.email;
                    const isPlayer = activePlayerIds.includes(msg.user.id);

                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                            <div className="flex items-center gap-2 mb-0.5 max-w-full flex-wrap">
                                <span className={`text-[11px] font-bold ${isMe ? "text-blue-400" : "text-gray-400"}`}>
                                    {msg.user.name || msg.user.email?.split("@")[0] || "Anon"}
                                </span>
                                <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-bold tracking-wider ${isPlayer ? "bg-amber-500/20 text-amber-500" : "bg-white/5 text-gray-500"}`}>
                                    {isPlayer ? "JUGADOR" : "VISITANTE"}
                                </span>
                                {!compact && (
                                    <span className="text-[9px] opacity-40 ml-auto pl-2">
                                        {format(new Date(msg.createdAt), "HH:mm")}
                                    </span>
                                )}
                            </div>
                            <div
                                className={`px-3 py-1.5 rounded-lg text-xs break-words max-w-[90%] leading-relaxed
                  ${isMe ? "bg-blue-600/20 text-blue-100 rounded-tr-none" : "bg-white/5 text-gray-200 rounded-tl-none"}
                `}
                            >
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Input */}
            <form onSubmit={send} className="p-2 bg-base-200 border-t border-white/5 flex gap-2">
                <input
                    className="input input-sm input-bordered flex-1 bg-black/20 text-xs"
                    placeholder="Escribe algo..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    maxLength={500}
                />
                <button
                    type="submit"
                    disabled={!inputValue.trim() || sending}
                    className="btn btn-sm btn-ghost btn-square text-blue-400 disabled:opacity-30"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </form>
        </div>
    );
}

