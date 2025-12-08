"use client";

import { useState } from "react";
import ChatWindow from "./ChatWindow";

type Props = {
    roomId: string;
    activePlayerIds?: string[];
};

export default function ChatBubble({ roomId, activePlayerIds = [] }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [unread, setUnread] = useState(0);

    // Podriamos escuchar pusher aqui tambien para contar unread messages si está cerrado.
    // Por simplicidad, solo mostramos el botón.

    return (
        <>
            {/* Botón Flotante (Solo visible en movil vía clases CSS o lógica padre) */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-50 btn btn-circle btn-primary shadow-lg border-2 border-white/20 sm:hidden"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>

            {/* Modal / Drawer para movil */}
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-end sm:hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    {/* Overlay click to close */}
                    <div className="absolute inset-0" onClick={() => setIsOpen(false)} />

                    <div className="relative w-full h-[60vh] bg-base-300 rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center p-3 border-b border-white/10 bg-base-200">
                            <span className="font-bold text-sm">Chat de Sala</span>
                            <button onClick={() => setIsOpen(false)} className="btn btn-xs btn-circle btn-ghost">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <ChatWindow
                                roomId={roomId}
                                activePlayerIds={activePlayerIds}
                                className="h-full rounded-none border-none"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

