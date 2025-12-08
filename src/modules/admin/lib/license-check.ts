import { headers } from "next/headers";
import prisma from "@/modules/ui/lib/prisma";

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || "https://777galaxy.online";

export async function verifyLicense() {
    // 1. Get Settings from DB
    const settings = await prisma.systemSettings.findFirst();
    const dbKey = settings?.licenseKey;
    const envKey = process.env.LICENSE_KEY;

    // Prefer DB key, fallback to env
    const keyToUse = dbKey || envKey;

    if (!keyToUse) {
        console.error("❌ [LICENSE] No LICENSE_KEY found in DB or .env");
        return { valid: false, features: [] };
    }

    try {
        const domain = process.env.NEXT_PUBLIC_APP_URL || "unknown-domain";

        const res = await fetch(`${LICENSE_SERVER_URL}/api/license/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: keyToUse, domain }),
            cache: "no-store",
        });

        if (!res.ok) {
            const data = await res.json();
            console.error(`❌ [LICENSE] Verification failed: ${data.message}`);
            return { valid: false, features: [] };
        }

        const data = await res.json();

        // Update DB with latest status if we have settings
        if (settings) {
            await prisma.systemSettings.update({
                where: { id: settings.id },
                data: {
                    licenseData: data,
                    lastLicenseCheck: new Date()
                }
            });
        }

        if (data.valid) {
            console.log("✅ [LICENSE] License verified successfully.");
            return { valid: true, features: data.features || [] };
        } else {
            console.error(`❌ [LICENSE] Invalid license: ${data.message}`);
            return { valid: false, features: [] };
        }
    } catch (error) {
        console.error("❌ [LICENSE] Error connecting to license server:", error);

        // Optional: Fallback to cached data if server is down?
        if (settings?.licenseData) {
            console.log("⚠️ [LICENSE] Using cached license data due to error.");
            const cached = settings.licenseData as any;
            return { valid: cached.valid, features: cached.features || [] };
        }

        return { valid: false, features: [] };
    }
}

