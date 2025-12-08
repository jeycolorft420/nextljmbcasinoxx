import React, { useState } from "react";

interface Props {
    serverHash: string | null;
    serverSeed: string | null; // Solo disponible al finalizar
    clientSeed: string;
    nonce: number;
}

export function ProvablyFairWidget({ serverHash, serverSeed, clientSeed, nonce }: Props) {
    const [expanded, setExpanded] = useState(false);

    if (!serverHash) return null;

    return (
        <div className="text-xs bg-black/20 p-2 rounded border border-white/5 mt-2">
            <div
                className="flex items-center justify-between cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-1">
                    <span className="text-emerald-400">🛡️</span>
                    <span className="font-semibold">Provably Fair</span>
                </div>
                <span>{expanded ? "▼" : "▶"}</span>
            </div>

            {expanded && (
                <div className="mt-2 space-y-2 animate-in slide-in-from-top-1">
                    <div>
                        <div className="text-[10px] uppercase tracking-wider opacity-50">Hash de la Ronda (SHA256)</div>
                        <div className="font-mono bg-black/40 p-1 rounded text-[10px] break-all select-all text-emerald-500/80">
                            {serverHash}
                        </div>
                        <div className="text-[9px] opacity-40 mt-0.5">
                            Este hash prueba que el resultado fue generado antes de iniciar.
                        </div>
                    </div>

                    {serverSeed ? (
                        <div>
                            <div className="text-[10px] uppercase tracking-wider opacity-50 text-yellow-500">Semilla Revelada</div>
                            <div className="font-mono bg-yellow-500/10 p-1 rounded text-[10px] break-all select-all text-yellow-200/80">
                                {serverSeed}
                            </div>
                            <div className="text-[9px] opacity-40 mt-0.5">
                                Copia esto para verificar que coincide con el Hash.
                            </div>
                        </div>
                    ) : (
                        <div className="text-[10px] italic opacity-40">
                            La semilla se revelará al finalizar la ronda.
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                            <span className="opacity-50">Client Seed:</span> <span className="font-mono opacity-80">{clientSeed}</span>
                        </div>
                        <div>
                            <span className="opacity-50">Nonce:</span> <span className="font-mono opacity-80">{nonce}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

