
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/verification/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            if (!res.ok) throw new Error("Error al enviar");

            toast.success("Verificación enviada correctamente");
            router.push("/verification/pending");
        } catch (error) {
            toast.error("Ocurrió un error. Intenta nuevamente.");
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#1e293b] rounded-2xl p-6 shadow-2xl border border-white/10">
                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        Verificación de Identidad
                    </h1>
                    <p className="text-slate-400 text-sm mt-2">
                        Paso {step} de 4: {step === 1 ? "Datos Personales" : step === 2 ? "Fotos Documento" : step === 3 ? "Selfie" : "Revisión"}
                    </p>
                    {/* Progress Bar */}
                    <div className="w-full h-1 bg-white/10 mt-4 rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500">Nombre Completo (Como en ID)</label>
                                    <input required name="fullName" value={formData.fullName} onChange={handleChange} className="input input-bordered w-full bg-black/20" placeholder="Juan Pérez" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500">Cédula / DNI</label>
                                    <input required name="documentId" value={formData.documentId} onChange={handleChange} className="input input-bordered w-full bg-black/20" placeholder="1234567890" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500">Fecha Nacimiento</label>
                                    <input required type="date" name="dob" value={formData.dob} onChange={handleChange} className="input input-bordered w-full bg-black/20" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-slate-500">Fecha Expedición</label>
                                    <input required type="date" name="issueDate" value={formData.issueDate} onChange={handleChange} className="input input-bordered w-full bg-black/20" />
                                </div>
                                <div className="space-y-2 col-span-full">
                                    <label className="text-xs font-bold uppercase text-slate-500">Teléfono</label>
                                    <input required type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="input input-bordered w-full bg-black/20" placeholder="+57 300 123 4567" />
                                </div>
                            </div>
                            <button type="button" onClick={nextStep} className="btn btn-primary w-full mt-6">Siguiente</button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div className="alert alert-info text-xs">
                                📸 Usa la cámara para tomar foto frontal y trasera de tu documento.
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <CameraCapture label="Frente del Documento" onCapture={(img) => handleCapture("photoIdFront", img)} />
                                <CameraCapture label="Reverso del Documento" onCapture={(img) => handleCapture("photoIdBack", img)} />
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button type="button" onClick={prevStep} className="btn btn-ghost flex-1">Atrás</button>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="btn btn-primary flex-1"
                                    disabled={!formData.photoIdFront || !formData.photoIdBack}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div className="alert alert-warning text-xs">
                                🤳 Tómate una selfie sosteniendo tu documento al lado de tu rostro.
                            </div>
                            <div className="max-w-sm mx-auto">
                                <CameraCapture label="Selfie con Documento" onCapture={(img) => handleCapture("photoSelfie", img)} />
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button type="button" onClick={prevStep} className="btn btn-ghost flex-1">Atrás</button>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="btn btn-primary flex-1"
                                    disabled={!formData.photoSelfie}
                                >
                                    Revisar
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 text-center">
                            <div className="py-10">
                                <p className="text-lg">¡Todo listo para enviar!</p>
                                <p className="text-sm text-slate-400">Tus datos serán revisados manualmente por un administrador.</p>
                            </div>

                            <div className="flex gap-2 mt-6">
                                <button type="button" onClick={prevStep} className="btn btn-ghost flex-1">Atrás</button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn btn-primary flex-1"
                                >
                                    {loading ? "Enviando..." : "Confirmar y Enviar"}
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
