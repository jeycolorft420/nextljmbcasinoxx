// src/components/ProfilePhotoUploader.tsx
import { useState } from "react";
import { useSession } from "next-auth/react";

export default function ProfilePhotoUploader() {
    const { data: session } = useSession();
    const [preview, setPreview] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setPreview(url);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session?.user?.email) {
            setMessage("Necesitas iniciar sesión");
            return;
        }
        const input = e.target as HTMLFormElement;
        const fileInput = input.elements.namedItem("photo") as HTMLInputElement;
        if (!fileInput.files?.[0]) {
            setMessage("Selecciona una foto");
            return;
        }
        const formData = new FormData();
        formData.append("photo", fileInput.files[0]);
        try {
            const res = await fetch("/api/user/photo/route", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setMessage(data.message);
                // optionally update preview with returned url
                setPreview(data.url);
            } else {
                setMessage(data.error || "Error al subir");
            }
        } catch (err) {
            console.error(err);
            setMessage("Error de red");
        }
    };

    return (
        <div className="max-w-md mx-auto p-4 bg-card rounded-2xl border border-white/10">
            <h2 className="text-xl font-bold mb-4 text-center">Cambiar foto de perfil</h2>
            {message && <p className="text-center mb-2 text-green-400">{message}</p>}
            {preview && (
                <div className="flex justify-center mb-4">
                    <img src={preview} alt="Preview" className="w-24 h-24 rounded-full object-cover" />
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
                <input type="file" name="photo" accept="image/*" onChange={handleFileChange} className="w-full" />
                <button type="submit" className="w-full btn btn-primary">Subir foto</button>
            </form>
        </div>
    );
}

