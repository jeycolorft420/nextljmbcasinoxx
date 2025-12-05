"use client";

import React, { useEffect, useState } from "react";

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "neutral";
}

export default function ConfirmationModal({
    isOpen,
    title,
    children,
    onConfirm,
    onCancel,
    confirmText = "Aceptar",
    cancelText = "Cancelar",
    variant = "neutral",
}: ConfirmationModalProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setVisible(true);
        } else {
            const t = setTimeout(() => setVisible(false), 300); // Wait for animation
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    if (!visible && !isOpen) return null;

    return (
        <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onCancel}
            />

            {/* Modal Card */}
            <div className={`
        relative bg-[#1e293b] border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50 w-full max-w-sm transform transition-all duration-300
        ${isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"}
      `}>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <div className="text-white/70 mb-6 text-sm leading-relaxed">
                    {children}
                </div>

                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg font-medium text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg font-bold text-sm text-white shadow-lg transition-all active:scale-95
              ${variant === "danger"
                                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                                : "bg-[#10b981] hover:bg-[#059669] shadow-emerald-500/20"}
            `}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
