"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Transaction = {
    id: string;
    amountCents: number;
    kind: string;
    reason: string;
    createdAt: string;
};

export default function HistoryPage() {
    const [txs, setTxs] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/me/transactions")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setTxs(data);
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    return (
        <main className="max-w-2xl mx-auto p-4 space-y-4">
            <div className="flex items-center gap-4">
                <Link href="/me" className="btn btn-ghost btn-sm">← Volver</Link>
                <h1 className="text-2xl font-bold">Historial de Transacciones</h1>
            </div>

            <div className="card bg-base-200">
                {loading ? (
                    <div className="p-4 text-center opacity-70">Cargando...</div>
                ) : txs.length === 0 ? (
                    <div className="p-4 text-center opacity-70">No tienes transacciones aún.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table w-full text-sm">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>Monto</th>
                                    <th>Razón</th>
                                </tr>
                            </thead>
                            <tbody>
                                {txs.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-white/5">
                                        <td className="opacity-70 text-xs">
                                            {format(new Date(tx.createdAt), "dd/MM HH:mm", { locale: es })}
                                        </td>
                                        <td>
                                            <span className={`badge badge-xs ${["DEPOSIT", "WIN_CREDIT", "REFERRAL_BONUS"].includes(tx.kind)
                                                    ? "badge-success"
                                                    : ["WITHDRAW"].includes(tx.kind) ? "badge-warning" : "badge-neutral"
                                                }`}>
                                                {tx.kind.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td className={`font-mono font-bold ${tx.amountCents >= 0 ? "text-green-400" : "text-white"}`}>
                                            {tx.amountCents > 0 ? "+" : ""}${tx.amountCents / 100}
                                        </td>
                                        <td className="max-w-[200px] truncate opacity-80" title={tx.reason}>
                                            {tx.reason}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </main>
    );
}
