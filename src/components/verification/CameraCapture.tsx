
"use client";

import { useRef, useState, useCallback } from "react";
import { toast } from "sonner";

interface CameraCaptureProps {
    onCapture: (imageSrc: string) => void;
    label: string;
}

export default function CameraCapture({ onCapture, label }: CameraCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [captured, setCaptured] = useState<string | null>(null);

    const startCamera = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" }
            });
            setStream(s);
            if (videoRef.current) {
                videoRef.current.srcObject = s;
            }
        } catch (err) {
            toast.error("No se pudo acceder a la cámara. Revisa los permisos.");
            console.error(err);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const takePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            setCaptured(dataUrl);
            onCapture(dataUrl);
            stopCamera(); // Auto stop after capture
        }
    }, [stream, onCapture]);

    const retake = () => {
        setCaptured(null);
        startCamera();
    };

    return (
        <div className="border border-white/10 rounded-xl p-4 bg-black/20">
            <h3 className="font-bold mb-2 text-sm text-slate-300">{label}</h3>

            {!stream && !captured && (
                <button
                    onClick={startCamera}
                    type="button"
                    className="w-full h-48 flex items-center justify-center bg-white/5 rounded-lg border-2 border-dashed border-white/20 hover:border-primary/50 transition-colors"
                >
                    <div className="text-center">
                        <span className="text-2xl">📸</span>
                        <p className="text-xs mt-2 text-slate-400">Activar Cámara</p>
                    </div>
                </button>
            )}

            {stream && !captured && (
                <div className="relative overflow-hidden rounded-lg bg-black">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-auto object-cover mirror-mode"
                    />
                    <button
                        onClick={takePhoto}
                        type="button"
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 btn btn-primary btn-circle btn-lg border-4 border-black/50"
                    >

                    </button>
                </div>
            )}

            {captured && (
                <div className="relative">
                    <img src={captured} alt="Capture" className="w-full rounded-lg" />
                    <button
                        onClick={retake}
                        type="button"
                        className="absolute top-2 right-2 btn btn-xs btn-error"
                    >
                        Repetir
                    </button>
                </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
