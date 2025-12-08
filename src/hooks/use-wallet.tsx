"use client";

import { useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";

type WalletContextType = {
    balanceCents: number | null;
    loading: boolean;
    selectedRouletteSkin: string | null;
    refreshBalance: () => Promise<void>;
    optimisticUpdate: (deltaCents: number) => void;
    rollbackUpdate: (deltaCents: number) => void;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
    const { status } = useSession();
    const [balanceCents, setBalanceCents] = useState<number | null>(null);
    const [selectedRouletteSkin, setSelectedRouletteSkin] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchBalance = useCallback(async () => {
        if (status !== "authenticated") {
            setBalanceCents(null);
            setSelectedRouletteSkin(null);
            return;
        }
        try {
            const r = await fetch("/api/wallet/me", { cache: "no-store" });
            if (r.ok) {
                const d = await r.json();
                setBalanceCents(d.balanceCents ?? 0);
                setSelectedRouletteSkin(d.selectedRouletteSkin ?? "default");
            }
        } catch (e) {
            console.error("Error fetching balance:", e);
        }
    }, [status]);

    // Polling logic
    useEffect(() => {
        fetchBalance();
        const t = setInterval(() => {
            if (document.visibilityState === "visible") fetchBalance();
        }, 10000);
        return () => clearInterval(t);
    }, [fetchBalance]);

    // Optimistic helpers
    const optimisticUpdate = (deltaCents: number) => {
        setBalanceCents((prev) => (prev !== null ? prev + deltaCents : prev));
    };

    const rollbackUpdate = (deltaCents: number) => {
        setBalanceCents((prev) => (prev !== null ? prev - deltaCents : prev));
    };

    return (
        <WalletContext.Provider value={{ balanceCents, loading, selectedRouletteSkin, refreshBalance: fetchBalance, optimisticUpdate, rollbackUpdate }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error("useWallet must be used within a WalletProvider");
    }
    return context;
}

