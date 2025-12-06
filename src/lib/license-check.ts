import { headers } from "next/headers";

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || "https://777galaxy.online"; // Default to your server
const LICENSE_KEY = process.env.LICENSE_KEY;

export async function verifyLicense() {
    if (!LICENSE_KEY) {
        console.error("❌ [LICENSE] No LICENSE_KEY found in .env");
        return false;
    }

    try {
        // En producción, obtenemos el dominio real. En dev, usamos localhost.
        // Nota: En Next.js App Router, obtener el dominio en 'instrumentation' o server-side puro puede ser truculento.
        // Para simplificar, enviamos una señal o dejamos que el servidor detecte la IP.
        // Si queremos enviar el dominio, necesitamos pasarlo como argumento o configurarlo en .env
        const domain = process.env.NEXT_PUBLIC_APP_URL || "unknown-domain";

        const res = await fetch(`${LICENSE_SERVER_URL}/api/license/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: LICENSE_KEY, domain }),
            cache: "no-store", // Importante: no cachear
        });

        if (!res.ok) {
            const data = await res.json();
            console.error(`❌ [LICENSE] Verification failed: ${data.message}`);
            return false;
        }

        const data = await res.json();
        if (data.valid) {
            console.log("✅ [LICENSE] License verified successfully.");
            return { valid: true, features: data.features || [] };
        } else {
            console.error(`❌ [LICENSE] Invalid license: ${data.message}`);
            return { valid: false, features: [] };
        }
    } catch (error) {
        console.error("❌ [LICENSE] Error connecting to license server:", error);
        // Fallback: ¿Permitir si el servidor está caído? 
        // Por seguridad estricta: NO. Por usabilidad: Tal vez (con un grace period).
        // Aquí denegamos por defecto.
        return { valid: false, features: [] };
    }
}
