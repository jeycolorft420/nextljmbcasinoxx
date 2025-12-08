"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

// Tipo simple para la licencia
type License = {
    id: string;
    key: string;
    clientName: string;
    lockedDomain: string | null;
    isActive: boolean;
    lastCheckedAt: string | null;
    createdAt: string;
    features: string[]; // Added features
};

const AVAILABLE_FEATURES = [
    { id: "roulette", label: "Roulette" },
    { id: "dice", label: "Dice Duel" },
    { id: "chat", label: "Chat System" },
    { id: "support", label: "Support Ticket System" },
    { id: "payments", label: "Payments Integration" },
];

export function LicenseManager() {
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);
    const [newClientName, setNewClientName] = useState("");
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]); // For creation

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editFeatures, setEditFeatures] = useState<string[]>([]);

    const loadLicenses = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/licenses");
            if (res.ok) {
                const data = await res.json();
                setLicenses(data);
            }
        } catch (error) {
            console.error(error);
            toast.error("Error loading licenses");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLicenses();
    }, []);

    const createLicense = async () => {
        if (!newClientName) return toast.error("Client name required");
        try {
            const res = await fetch("/api/admin/licenses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientName: newClientName,
                    features: selectedFeatures
                }),
            });
            if (res.ok) {
                toast.success("License created!");
                setNewClientName("");
                setSelectedFeatures([]);
                loadLicenses();
            } else {
                toast.error("Failed to create");
            }
        } catch (e) {
            toast.error("Error creating license");
        }
    };

    const toggleFeature = (featureId: string) => {
        setSelectedFeatures(prev =>
            prev.includes(featureId)
                ? prev.filter(f => f !== featureId)
                : [...prev, featureId]
        );
    };

    const startEditing = (lic: License) => {
        setEditingId(lic.id);
        // @ts-ignore
        setEditFeatures(Array.isArray(lic.features) ? lic.features : []);
    };

    const toggleEditFeature = (featureId: string) => {
        setEditFeatures(prev =>
            prev.includes(featureId)
                ? prev.filter(f => f !== featureId)
                : [...prev, featureId]
        );
    };

    const saveFeatures = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/licenses/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ features: editFeatures }),
            });
            if (res.ok) {
                toast.success("Features updated");
                setEditingId(null);
                loadLicenses();
            } else {
                toast.error("Failed to update");
            }
        } catch (e) {
            toast.error("Error updating features");
        }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/admin/licenses/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !currentStatus }),
            });
            if (res.ok) {
                toast.success("Status updated");
                loadLicenses();
            }
        } catch (e) {
            toast.error("Error updating status");
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto bg-background rounded-xl border border-white/10 shadow-2xl">
            <h1 className="text-3xl font-bold mb-6 text-white">License Manager</h1>

            {/* My License Activation */}
            <div className="bg-slate-900 border border-emerald-500/30 p-6 rounded-xl mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg>
                </div>
                <h2 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                    🔑 Activar Licencia de la Plataforma
                </h2>
                <div className="flex gap-4 items-end max-w-2xl relative z-10">
                    <div className="flex-1">
                        <label className="block text-sm text-slate-400 mb-1">Tu clave de licencia</label>
                        <input
                            type="text"
                            placeholder="XXXX-YYYY-ZZZZ-WWWW"
                            className="w-full bg-black/40 text-white p-3 rounded-lg border border-white/10 font-mono text-lg focus:border-emerald-500 transition-colors"
                            id="myLicenseKey"
                        />
                    </div>
                    <button
                        onClick={async () => {
                            const input = document.getElementById("myLicenseKey") as HTMLInputElement;
                            const key = input.value;
                            if (!key) return toast.error("Ingresa una licencia");
                            const toastId = toast.loading("Verificando...");
                            try {
                                const res = await fetch("/api/admin/license/update", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ key })
                                });
                                const data = await res.json();
                                if (res.ok && data.result?.valid) {
                                    toast.success("¡Licencia Activada! Las funciones han sido habilitadas.", { id: toastId });
                                    setTimeout(() => window.location.reload(), 1500); // Reload to refresh context
                                } else {
                                    toast.error(`Error: ${data.result?.features?.length ? 'Parcialmente válida' : 'Licencia Inválida'}`, { id: toastId });
                                }
                            } catch (e) {
                                toast.error("Error de conexión", { id: toastId });
                            }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
                    >
                        Validar y Activar
                    </button>
                </div>
                <p className="text-xs text-slate-500 mt-4 max-w-xl">
                    Usa esto para activar las funciones <b>(Roulette, Dice, etc.)</b> en este servidor. Si el servidor de licencias aprueba la clave, las salas aparecerán automáticamente.
                </p>
            </div>

            {/* Creator */}
            <div className="bg-slate-800 p-4 rounded-lg mb-8">
                <div className="flex gap-4 items-end mb-4">
                    <div className="flex-1">
                        <label className="block text-sm text-slate-400 mb-1">Client Name</label>
                        <input
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            className="w-full bg-slate-700 text-white p-2 rounded border border-slate-600"
                            placeholder="e.g. Casino Royale LLC"
                        />
                    </div>
                    <button
                        onClick={createLicense}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold"
                    >
                        Generate Key
                    </button>
                </div>

                {/* Feature Selection for New License */}
                <div>
                    <label className="block text-sm text-slate-400 mb-2">Enabled Features</label>
                    <div className="flex gap-4 flex-wrap">
                        {AVAILABLE_FEATURES.map(feat => (
                            <label key={feat.id} className="flex items-center gap-2 cursor-pointer bg-slate-700 px-3 py-1 rounded hover:bg-slate-600">
                                <input
                                    type="checkbox"
                                    checked={selectedFeatures.includes(feat.id)}
                                    onChange={() => toggleFeature(feat.id)}
                                    className="rounded border-slate-500 bg-slate-800"
                                />
                                <span className="text-sm text-slate-200">{feat.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="bg-card rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-800 text-slate-100 uppercase font-bold">
                        <tr>
                            <th className="p-4">Client</th>
                            <th className="p-4">License Key</th>
                            <th className="p-4">Features</th>
                            <th className="p-4">Domain Lock</th>
                            <th className="p-4">Last Check</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="p-4 text-center">Loading...</td></tr>
                        ) : licenses.map((lic) => (
                            <tr key={lic.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                <td className="p-4 font-medium text-white">{lic.clientName}</td>
                                <td className="p-4 font-mono text-yellow-400 select-all">{lic.key}</td>
                                <td className="p-4">
                                    {editingId === lic.id ? (
                                        <div className="flex flex-col gap-1">
                                            {AVAILABLE_FEATURES.map(feat => (
                                                <label key={feat.id} className="flex items-center gap-2 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={editFeatures.includes(feat.id)}
                                                        onChange={() => toggleEditFeature(feat.id)}
                                                    />
                                                    {feat.label}
                                                </label>
                                            ))}
                                            <div className="flex gap-2 mt-1">
                                                <button onClick={() => saveFeatures(lic.id)} className="text-green-400 text-xs hover:underline">Save</button>
                                                <button onClick={() => setEditingId(null)} className="text-slate-400 text-xs hover:underline">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                                            {/* @ts-ignore */}
                                            {lic.features && Array.isArray(lic.features) && lic.features.length > 0 ? (
                                                // @ts-ignore
                                                lic.features.map((f: string) => (
                                                    <span key={f} className="bg-purple-900 text-purple-200 px-1.5 py-0.5 rounded text-[10px] uppercase">
                                                        {f}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-slate-500 text-xs">None</span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="p-4">
                                    {lic.lockedDomain ? (
                                        <span className="bg-blue-900 text-blue-200 px-2 py-1 rounded text-xs">{lic.lockedDomain}</span>
                                    ) : (
                                        <span className="text-slate-500 italic">Unused</span>
                                    )}
                                </td>
                                <td className="p-4 text-xs text-slate-400">
                                    {lic.lastCheckedAt ? new Date(lic.lastCheckedAt).toLocaleString() : "Never"}
                                </td>
                                <td className="p-4">
                                    {lic.isActive ? (
                                        <span className="text-green-400 font-bold">Active</span>
                                    ) : (
                                        <span className="text-red-500 font-bold">Revoked</span>
                                    )}
                                </td>
                                <td className="p-4 flex flex-col gap-2">
                                    <button
                                        onClick={() => toggleStatus(lic.id, lic.isActive)}
                                        className={`px-3 py-1 rounded text-xs font-bold ${lic.isActive ? "bg-red-900/50 text-red-400 hover:bg-red-900" : "bg-green-900/50 text-green-400 hover:bg-green-900"
                                            }`}
                                    >
                                        {lic.isActive ? "Revoke" : "Activate"}
                                    </button>
                                    {!editingId && (
                                        <button
                                            onClick={() => startEditing(lic)}
                                            className="px-3 py-1 rounded text-xs font-bold bg-slate-700 text-slate-200 hover:bg-slate-600"
                                        >
                                            Edit Features
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function AdminLicensesPage() {
    return <LicenseManager />;
}

