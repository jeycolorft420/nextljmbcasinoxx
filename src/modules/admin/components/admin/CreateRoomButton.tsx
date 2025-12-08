"use client";

import { useState } from "react";

type Props = {
    price: number;
    type: "ROULETTE" | "DICE_DUEL";
    label: string;
};

export default function CreateRoomButton({ price, type, label }: Props) {
    const [loading, setLoading] = useState(false);

    const createRoom = async () => {
        setLoading(true);
        try {
            // Ask for bot interval
            const intervalStr = window.prompt("¿Intervalo de Bots en Segundos? (0 = Desactivado, 5 = 5 seg)", "3");
            const botWaitMs = intervalStr ? parseInt(intervalStr) * 1000 : 0;

            const payload: any = { priceCents: price, gameType: type, botWaitMs };
            if (type === "DICE_DUEL") payload.capacity = 2;

            const r = await fetch("/api/rooms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) return alert(d.error || "No se pudo crear la sala");

            // No need to reload, pusher will handle it or user will see it when navigating
            alert("Sala creada exitosamente");
        } catch (err) {
            console.error(err);
            alert("Error al crear sala");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={createRoom}
            disabled={loading}
            className="btn btn-primary btn-sm whitespace-nowrap"
        >
            {loading ? "..." : label}
        </button>
    );
}

