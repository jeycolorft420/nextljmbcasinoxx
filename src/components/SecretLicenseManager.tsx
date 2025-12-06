"use client";

import { useEffect, useState } from "react";
import { LicenseManager } from "@/app/admin/licenses/page";

export default function SecretLicenseManager() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Logic: Ctrl + Alt + 7 (Instant)
            if (e.ctrlKey && e.altKey && e.key === "7") {
                setShow((prev) => !prev); // Toggle
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                <button
                    onClick={() => setShow(false)}
                    className="absolute top-4 right-4 z-50 p-2 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>

                <LicenseManager />
            </div>
        </div>
    );
}
