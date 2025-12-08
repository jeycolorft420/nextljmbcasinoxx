"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { toast } from "sonner";
import { getCroppedImg } from "@/modules/ui/lib/canvasUtils"; // We'll need to create this utility

type Props = {
    isOpen: boolean;
    onClose: () => void;
    game: "DICE_DUEL" | "ROULETTE";
    currentUrl?: string;
    onSave: (newUrl: string) => void;
};

export default function GameImageEditor({ isOpen, onClose, game, currentUrl, onSave }: Props) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [uploading, setUploading] = useState(false);

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageDataUrl = await readFile(file);
            setImageSrc(imageDataUrl);
        }
    };

    const readFile = (file: File) => {
        return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(reader.result as string), false);
            reader.readAsDataURL(file);
        });
    };

    const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleSave = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        try {
            setUploading(true);
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);

            const formData = new FormData();
            formData.append("file", croppedImageBlob, "cover.png");

            const res = await fetch("/api/admin/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) throw new Error("Upload failed");

            const data = await res.json();
            onSave(data.url);
            onClose();
            toast.success("Imagen actualizada correctamente");
        } catch (e) {
            console.error(e);
            toast.error("Error al guardar la imagen");
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="font-bold text-lg">Editar Portada: {game === "DICE_DUEL" ? "Dados" : "Ruleta"}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="flex-1 relative min-h-[400px] bg-black">
                    {imageSrc ? (
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={16 / 9} // Aspect ratio for the card
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                        />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4">
                            <p>Sube una imagen para comenzar</p>
                            <label className="btn btn-primary cursor-pointer">
                                Seleccionar Archivo
                                <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                            </label>
                        </div>
                    )}
                </div>

                {imageSrc && (
                    <div className="p-4 border-t border-white/10 space-y-4">
                        <div className="flex items-center gap-4">
                            <span className="text-sm">Zoom</span>
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                aria-labelledby="Zoom"
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="w-full accent-primary"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setImageSrc(null)} className="btn btn-ghost">Cancelar</button>
                            <button onClick={handleSave} disabled={uploading} className="btn btn-primary">
                                {uploading ? "Guardando..." : "Guardar Cambios"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

