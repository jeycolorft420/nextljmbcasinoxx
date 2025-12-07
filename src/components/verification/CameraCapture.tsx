
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
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
    const [permissionError, setPermissionError] = useState(false);

    // Initialize camera
    const startCamera = async () => {
        setPermissionError(false);
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" } // Prefer back camera for docs
            });
            setStream(s);
        } catch (err) {
            console.error("Camera Error:", err);
            setPermissionError(true);
            toast.error("No se pudo acceder a la cámara. Permite el acceso.");
        }
    };

    // Attach stream to video element when stream or ref changes
    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Play error:", e)); // Ensure it plays
        }
    }, [stream]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

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
            stopCamera();
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
                        <p className="text-xs mt-2 text-slate-400">
                            {permissionError ? "Permiso denegado. Reintentar." : "Activar Cámara"}
                        </p>
                    </div>
                </button>
            )}

            {stream && !captured && (
                <div className="relative overflow-hidden rounded-lg bg-black aspect-video flex items-center justify-center">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    <button
                        onClick={takePhoto}
                        type="button"
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 btn btn-primary btn-circle btn-lg border-4 border-black/50 shadow-xl"
                    >
                        <div className="w-4 h-4 rounded-full bg-white animate-pulse" />
                    </button>
                </div>
            )}

            {captured && (
                <div className="relative">
                    <img src={captured} alt="Capture" className="w-full rounded-lg border border-white/20" />
                    <button
                        onClick={retake}
                        type="button"
                        className="absolute top-2 right-2 btn btn-xs btn-error shadow-lg"
                    >
                        Repetir
                    </button>
                    <div className="absolute bottom-2 right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        LISTO
                    </div>
                </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
