
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CameraCapture from "@/components/verification/CameraCapture";
import { toast } from "sonner";

export default function VerificationPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        fullName: "",
        dob: "",
        documentId: "",
        issueDate: "",
        phoneNumber: "",
        photoProfile: "",
        photoIdFront: "",
        photoIdBack: "",
        photoSelfie: ""
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCapture = (field: string, dataUrl: string) => {
        setFormData({ ...formData, [field]: dataUrl });
    };

    // Compression Utility
    const compressImage = (base64Str: string, maxWidth = 1000, quality = 0.7): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = base64Str;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.onerror = () => resolve(base64Str); // Fallback
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Compress images before sending
            const compressedData = {
                ...formData,
                photoProfile: formData.photoProfile ? await compressImage(formData.photoProfile) : "",
                photoIdFront: formData.photoIdFront ? await compressImage(formData.photoIdFront) : "",
                photoIdBack: formData.photoIdBack ? await compressImage(formData.photoIdBack) : "",
                photoSelfie: formData.photoSelfie ? await compressImage(formData.photoSelfie) : "",
            };

            const res = await fetch("/api/verification/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(compressedData)
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || "Error al enviar");
            }

            toast.success("Verificación enviada correctamente");
            router.push("/verification/pending");
        } catch (error: any) {
            toast.error(error.message || "Error: Verifique el tamaño de las imágenes o su conexión.");
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1B2735] via-[#090A0F] to-[#090A0F] text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-black/40 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 ring-1 ring-white/5">
                <div className="mb-10 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 text-primary mb-4 border border-primary/20 shadow-[0_0_30px_-5px_var(--primary-color)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
                        Verificación de Identidad
                    </h1>
                    <p className="text-slate-400 mt-2 font-medium">
                        Completa el proceso para desbloquear todas las funciones.
                    </p>

                    {/* Progress Steps */}
                    <div className="flex items-center justify-between mt-8 max-w-md mx-auto relative px-2">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-white/10 rounded-full -z-10" />
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-500 -z-10`} style={{ width: `${((step - 1) / 3) * 100}%` }} />

                        {[1, 2, 3, 4].map((s) => (
                            <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ring-4 ring-[#090A0F] ${step >= s ? "bg-primary text-black scale-110" : "bg-slate-800 text-slate-400"}`}>
                                {s}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between max-w-md mx-auto text-[10px] text-slate-500 uppercase font-bold mt-2 tracking-wider">
                        <span>Datos</span>
                        <span>Docs</span>
                        <span>Selfie</span>
                        <span>Fin</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="min-h-[400px]">
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-400 tracking-wider ml-1">Nombre Completo</label>
                                    <input required name="fullName" value={formData.fullName} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-slate-600" placeholder="Ej: Juan Pérez" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-400 tracking-wider ml-1">Doc. Identidad</label>
                                    <input required name="documentId" value={formData.documentId} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-slate-600" placeholder="Ej: 1122334455" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-400 tracking-wider ml-1">Fecha Nacimiento</label>
                                    <input required type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-slate-300" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-400 tracking-wider ml-1">Fecha Expedición</label>
                                    <input required type="date" name="issueDate" value={formData.issueDate} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-slate-300" />
                                </div>
                                <div className="space-y-2 col-span-full">
                                    <label className="text-xs font-bold uppercase text-slate-400 tracking-wider ml-1">Teléfono</label>
                                    <input required type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-slate-600" placeholder="+57 300 ..." />
                                </div>
                            </div>
                            <button type="button" onClick={nextStep} className="w-full bg-primary hover:bg-primary/90 text-black font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] mt-4">
                                Continuar ➔
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
                                <span className="text-xl">📸</span>
                                <p className="text-sm text-blue-200">Usa buena iluminación. Asegúrate que el texto de tu documento sea legible y no tenga brillos.</p>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <CameraCapture label="Frente del Documento" onCapture={(img) => handleCapture("photoIdFront", img)} />
                                <CameraCapture label="Reverso del Documento" onCapture={(img) => handleCapture("photoIdBack", img)} />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={prevStep} className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold transition-all">Atrás</button>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="flex-1 bg-primary hover:bg-primary/90 text-black font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!formData.photoIdFront || !formData.photoIdBack}
                                >
                                    Siguiente Paso
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
                                <span className="text-xl">🤳</span>
                                <p className="text-sm text-yellow-200">Sostén tu documento al lado de tu rostro. Ambos deben verse claramente.</p>
                            </div>
                            <div className="max-w-md mx-auto">
                                <CameraCapture label="Selfie con Documento" onCapture={(img) => handleCapture("photoSelfie", img)} />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={prevStep} className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold transition-all">Atrás</button>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="flex-1 bg-primary hover:bg-primary/90 text-black font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!formData.photoSelfie}
                                >
                                    Revisar Todo
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500 text-center">
                            <div className="py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                                <div className="w-20 h-20 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl shadow-[0_0_30px_-10px_rgba(74,222,128,0.5)]">
                                    ✓
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">¡Todo Listo!</h3>
                                <p className="text-slate-400 max-w-sm mx-auto">
                                    Tus documentos serán enviados de forma segura para revisión manual. Este proceso suele tomar menos de 24 horas.
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <button type="button" onClick={prevStep} className="px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 font-bold transition-all">
                                    Corregir
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 bg-gradient-to-r from-primary to-emerald-400 hover:from-primary/90 hover:to-emerald-400/90 text-black font-extrabold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:scale-[1.02]"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="loading loading-spinner loading-sm"></span> Comprimiendo y Enviando...
                                        </span>
                                    ) : (
                                        "CONFIRMAR Y ENVIAR"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
