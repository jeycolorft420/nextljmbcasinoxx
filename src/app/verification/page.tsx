// src/app/verification/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerificationPage() {
    const [fullName, setFullName] = useState("");
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName || !documentFile || !selfieFile) {
            setMessage("Completa todos los campos.");
            return;
        }
        const formData = new FormData();
        formData.append("fullName", fullName);
        formData.append("document", documentFile);
        formData.append("selfie", selfieFile);
        try {
            const res = await fetch("/api/verification/submit/route", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setMessage(data.message);
                // Optionally redirect after a short delay
                setTimeout(() => router.push("/"), 3000);
            } else {
                setMessage(data.error || "Error al enviar verificación");
            }
        } catch (err) {
            console.error(err);
            setMessage("Error de red");
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="max-w-lg w-full bg-card p-8 rounded-2xl border border-white/10">
                <h1 className="text-2xl font-bold mb-4 text-center">Verificación de cuenta</h1>
                {message && <p className="text-center text-green-400 mb-4">{message}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="fullName">Nombre completo</label>
                        <input
                            id="fullName"
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full rounded-md border bg-background p-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="document">Documento de identidad (PDF/Imagen)</label>
                        <input
                            id="document"
                            type="file"
                            accept="application/pdf,image/*"
                            required
                            onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
                            className="w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="selfie">Selfie (foto reciente)</label>
                        <input
                            id="selfie"
                            type="file"
                            accept="image/*"
                            required
                            onChange={(e) => setSelfieFile(e.target.files?.[0] ?? null)}
                            className="w-full"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full btn btn-primary mt-2"
                    >
                        Enviar verificación
                    </button>
                </form>
            </div>
        </div>
    );
}
