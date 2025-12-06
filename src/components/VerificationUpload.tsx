"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Upload, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Status = "PENDING" | "APPROVED" | "REJECTED";

export default function VerificationUpload({
    status,
    rejectionReason,
    hasDocuments
}: {
    status: Status;
    rejectionReason?: string;
    hasDocuments: boolean;
}) {
    const router = useRouter();
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState<{
        front: File | null;
        back: File | null;
        selfie: File | null;
    }>({ front: null, back: null, selfie: null });

    const handleFileChange = (type: "front" | "back" | "selfie", e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
        }
    };

    const uploadFile = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Error subiendo archivo");
        const data = await res.json();
        return data.url;
    };

    const handleSubmit = async () => {
        if (!files.front || !files.back || !files.selfie) {
            toast.error("Debes subir las 3 fotos requeridas");
            return;
        }

        setUploading(true);
        try {
            // 1. Upload images sequentially
            const frontUrl = await uploadFile(files.front);
            const backUrl = await uploadFile(files.back);
            const selfieUrl = await uploadFile(files.selfie);

            // 2. Submit verification request
            const res = await fetch("/api/user/verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    documentUrl: frontUrl, // Stores front for now, or JSON logic if model supports multiple
                    // For simplicity in this iteration we might just store front image or join URLs.
                    // Let's assume the API handles updating specific fields if they exist in Prisma,
                    // OR we send them as a structured payload.
                    // Given the schema `documentUrl`, `profilePhotoUrl`, `selfieUrl`.
                    // We will map: front -> documentUrl, selfie -> selfieUrl. Back ID might need a new field or be part of documentUrl.
                    frontUrl,
                    backUrl,
                    selfieUrl
                })
            });

            if (res.ok) {
                toast.success("Documentos enviados correctamente");
                router.refresh();
            } else {
                toast.error("Error al enviar solicitud");
            }
        } catch (error) {
            console.error(error);
            toast.error("Error de conexión");
        } finally {
            setUploading(false);
        }
    };

    if (status === "APPROVED") {
        return (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-emerald-400">Identidad Verificada</h3>
                <p className="text-emerald-200/60 mt-2">Tu cuenta tiene acceso total a retiros y funciones avanzadas.</p>
            </div>
        );
    }

    if (status === "PENDING" || (hasDocuments && status === "PENDING")) {
        return (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 text-center">
                <Clock className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-blue-400">Verificación en Revisión</h3>
                <p className="text-blue-200/60 mt-2">Tu documentación está siendo revisada por nuestro equipo. Esto suele tomar menos de 24 horas.</p>
            </div>
        );
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">Verificación de Identidad</h3>
                    <p className="text-sm opacity-60">Para habilitar retiros, necesitamos validar que eres tú.</p>
                </div>
                {status === "REJECTED" && (
                    <div className="bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-xs font-bold border border-red-500/20">
                        Rechazado: {rejectionReason || "Datos ilegibles"}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* DNI Frontal */}
                <div className="border border-dashed border-white/20 rounded-xl p-4 hover:bg-white/5 transition-colors text-center group relative">
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileChange("front", e)} />
                    <div className="flex flex-col items-center gap-3">
                        <div className={`p-3 rounded-full ${files.front ? "bg-emerald-500/20 text-emerald-500" : "bg-white/10 text-white/40"}`}>
                            <FileText size={24} />
                        </div>
                        <div>
                            <div className="font-semibold text-sm">DNI (Frente)</div>
                            <div className="text-xs opacity-50 mt-1 truncate max-w-[120px]">
                                {files.front ? files.front.name : "Subir foto"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* DNI Trasero */}
                <div className="border border-dashed border-white/20 rounded-xl p-4 hover:bg-white/5 transition-colors text-center group relative">
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileChange("back", e)} />
                    <div className="flex flex-col items-center gap-3">
                        <div className={`p-3 rounded-full ${files.back ? "bg-emerald-500/20 text-emerald-500" : "bg-white/10 text-white/40"}`}>
                            <FileText size={24} />
                        </div>
                        <div>
                            <div className="font-semibold text-sm">DNI (Dorso)</div>
                            <div className="text-xs opacity-50 mt-1 truncate max-w-[120px]">
                                {files.back ? files.back.name : "Subir foto"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Selfie */}
                <div className="border border-dashed border-white/20 rounded-xl p-4 hover:bg-white/5 transition-colors text-center group relative">
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileChange("selfie", e)} />
                    <div className="flex flex-col items-center gap-3">
                        <div className={`p-3 rounded-full ${files.selfie ? "bg-emerald-500/20 text-emerald-500" : "bg-white/10 text-white/40"}`}>
                            <Camera size={24} />
                        </div>
                        <div>
                            <div className="font-semibold text-sm">Selfie con DNI</div>
                            <div className="text-xs opacity-50 mt-1 truncate max-w-[120px]">
                                {files.selfie ? files.selfie.name : "Tomar foto"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleSubmit}
                    disabled={uploading || !files.front || !files.back || !files.selfie}
                    className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                    {uploading ? "Subiendo..." : "Enviar Verificación"}
                </button>
            </div>
        </div>
    );
}
