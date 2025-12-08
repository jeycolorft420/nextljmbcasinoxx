"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

const FONTS = [
    "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Oswald", "Raleway",
    "Merriweather", "Playfair Display", "Source Sans Pro", "Nunito", "Ubuntu", "Rubik", "Work Sans", "Quicksand"
];

const THEMES = {
    "777Galaxy": {
        primaryColor: "#10b981",
        secondaryColor: "#0f172a",
        accentColor: "#1e293b",
        backgroundColor: "#050b14",
        textColor: "#f8fafc",
    },
    "Sunset": {
        primaryColor: "#d946ef",
        secondaryColor: "#4a1a4e",
        accentColor: "#ff9900",
        backgroundColor: "#2a0a2e",
        textColor: "#ffffff",
    },
    "Midnight": {
        primaryColor: "#ff0099",
        secondaryColor: "#111111",
        accentColor: "#00f3ff",
        backgroundColor: "#000000",
        textColor: "#ffffff",
    },
    "Forest": {
        primaryColor: "#34d399",
        secondaryColor: "#064e3b",
        accentColor: "#10b981",
        backgroundColor: "#052e16",
        textColor: "#ecfdf5",
    },
    "Luxury": {
        primaryColor: "#fbbf24",
        secondaryColor: "#1c1917",
        accentColor: "#d4af37",
        backgroundColor: "#000000",
        textColor: "#ffffff",
    },
};

export default function CustomizationPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [currentTheme, setCurrentTheme] = useState("Custom");

    const [settings, setSettings] = useState({
        siteName: "",
        logoUrl: "",
        faviconUrl: "",
        primaryColor: "#10b981",
        secondaryColor: "#0f172a",
        accentColor: "#1e293b",
        backgroundColor: "#050b14",
        textColor: "#f8fafc",
        fontFamily: "Inter",
    });

    useEffect(() => {
        fetch("/api/admin/settings")
            .then((res) => res.json())
            .then((data) => {
                if (data && !data.error) {
                    setSettings({
                        siteName: data.siteName || "",
                        logoUrl: data.logoUrl || "",
                        faviconUrl: data.faviconUrl || "",
                        primaryColor: data.primaryColor || "#10b981",
                        secondaryColor: data.secondaryColor || "#0f172a",
                        accentColor: data.accentColor || "#1e293b",
                        backgroundColor: data.backgroundColor || "#050b14",
                        textColor: data.textColor || "#f8fafc",
                        fontFamily: data.fontFamily || "Inter",
                    });
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const applyTheme = (themeName: string) => {
        setCurrentTheme(themeName);
        if (themeName === "Custom") return;

        const theme = THEMES[themeName as keyof typeof THEMES];
        if (theme) {
            setSettings(prev => ({ ...prev, ...theme }));
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "logoUrl" | "faviconUrl") => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/admin/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setSettings(prev => ({ ...prev, [field]: data.url }));
                toast.success(`${field === "logoUrl" ? "Logo" : "Favicon"} subido correctamente`);
            } else {
                toast.error("Error al subir archivo");
            }
        } catch (err) {
            toast.error("Error de conexión");
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/admin/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });

            if (res.ok) {
                toast.success("Configuración guardada. Recarga para ver cambios.");
            } else {
                toast.error("Error al guardar");
            }
        } catch (e) {
            toast.error("Error de conexión");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-2 text-white">Personalización</h1>
            <p className="text-slate-400 mb-8">Ajusta la apariencia de tu casino.</p>

            <div className="grid gap-8">

                {/* Themes */}
                <section className="bg-card p-6 rounded-xl border border-white/10">
                    <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                        <span className="text-2xl">🎭</span> Tema Predefinido
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {Object.keys(THEMES).map(theme => (
                            <button
                                key={theme}
                                onClick={() => applyTheme(theme)}
                                className={`btn ${currentTheme === theme ? "btn-primary" : "btn-ghost border border-white/10"}`}
                            >
                                {theme}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentTheme("Custom")}
                            className={`btn ${currentTheme === "Custom" ? "btn-primary" : "btn-ghost border border-white/10"}`}
                        >
                            Custom 🛠️
                        </button>
                    </div>
                </section>

                {/* Branding */}
                <section className="bg-card p-6 rounded-xl border border-white/10">
                    <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                        <span className="text-2xl">🏷️</span> Branding
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Nombre del Sitio</label>
                            <input
                                value={settings.siteName}
                                onChange={e => setSettings({ ...settings, siteName: e.target.value })}
                                className="w-full bg-background border border-white/10 rounded p-2 text-white"
                                placeholder="Mi Casino"
                            />
                        </div>

                        {/* Logo Upload */}
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Logo</label>
                            <div className="flex gap-2">
                                <input
                                    value={settings.logoUrl}
                                    onChange={e => setSettings({ ...settings, logoUrl: e.target.value })}
                                    className="w-full bg-background border border-white/10 rounded p-2 text-white"
                                    placeholder="https://..."
                                />
                                <label className="btn btn-primary whitespace-nowrap cursor-pointer">
                                    {uploading ? "..." : "Subir"}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, "logoUrl")} disabled={uploading} />
                                </label>
                            </div>
                            {settings.logoUrl && (
                                <div className="mt-2 p-2 bg-white/5 rounded border border-white/10 inline-block">
                                    <img src={settings.logoUrl} alt="Logo Preview" className="h-12 object-contain" />
                                </div>
                            )}
                        </div>

                        {/* Favicon Upload */}
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Favicon (Icono Web)</label>
                            <div className="flex gap-2">
                                <input
                                    value={settings.faviconUrl}
                                    onChange={e => setSettings({ ...settings, faviconUrl: e.target.value })}
                                    className="w-full bg-background border border-white/10 rounded p-2 text-white"
                                    placeholder="https://..."
                                />
                                <label className="btn btn-primary whitespace-nowrap cursor-pointer">
                                    {uploading ? "..." : "Subir"}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, "faviconUrl")} disabled={uploading} />
                                </label>
                            </div>
                            {settings.faviconUrl && (
                                <div className="mt-2 p-2 bg-white/5 rounded border border-white/10 inline-block">
                                    <img src={settings.faviconUrl} alt="Favicon Preview" className="h-8 w-8 object-contain" />
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Colors */}
                <section className="bg-card p-6 rounded-xl border border-white/10">
                    <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                        <span className="text-2xl">🎨</span> Colores
                    </h2>
                    <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">1. Fondo</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={settings.backgroundColor}
                                    onChange={e => {
                                        setSettings({ ...settings, backgroundColor: e.target.value });
                                        setCurrentTheme("Custom");
                                    }}
                                    className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                                />
                                <span className="text-mono text-sm">{settings.backgroundColor}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">2. Tarjetas</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={settings.secondaryColor}
                                    onChange={e => {
                                        setSettings({ ...settings, secondaryColor: e.target.value });
                                        setCurrentTheme("Custom");
                                    }}
                                    className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                                />
                                <span className="text-mono text-sm">{settings.secondaryColor}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">3. Bordes</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={settings.accentColor}
                                    onChange={e => {
                                        setSettings({ ...settings, accentColor: e.target.value });
                                        setCurrentTheme("Custom");
                                    }}
                                    className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                                />
                                <span className="text-mono text-sm">{settings.accentColor}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">4. Primario</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={settings.primaryColor}
                                    onChange={e => {
                                        setSettings({ ...settings, primaryColor: e.target.value });
                                        setCurrentTheme("Custom");
                                    }}
                                    className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                                />
                                <span className="text-mono text-sm">{settings.primaryColor}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">5. Texto</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={settings.textColor}
                                    onChange={e => {
                                        setSettings({ ...settings, textColor: e.target.value });
                                        setCurrentTheme("Custom");
                                    }}
                                    className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
                                />
                                <span className="text-mono text-sm">{settings.textColor}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Typography */}
                <section className="bg-card p-6 rounded-xl border border-white/10">
                    <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                        <span className="text-2xl">🔤</span> Tipografía
                    </h2>
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Fuente Principal</label>
                        <select
                            value={settings.fontFamily}
                            onChange={e => setSettings({ ...settings, fontFamily: e.target.value })}
                            className="w-full md:w-1/2 bg-background border border-white/10 rounded p-2 text-white"
                        >
                            {FONTS.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-2">
                            Se usará Google Fonts. Asegúrate de elegir una fuente legible.
                        </p>
                    </div>
                </section>

                <div className="flex justify-end pt-4">
                    <button
                        onClick={save}
                        disabled={saving}
                        className="btn btn-primary px-8 py-3 font-bold text-lg"
                    >
                        {saving ? "Guardando..." : "Guardar Cambios"}
                    </button>
                </div>

            </div>
        </div>
    );
}

