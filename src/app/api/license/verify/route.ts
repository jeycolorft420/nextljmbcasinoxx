import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { key, domain } = body;

        if (!key) {
            return NextResponse.json({ valid: false, message: "No key provided" }, { status: 400 });
        }

        // 1. Buscar la licencia
        const license = await prisma.license.findUnique({
            where: { key },
        });

        if (!license) {
            return NextResponse.json({ valid: false, message: "Invalid license key" }, { status: 404 });
        }

        // 2. Verificar estado activo
        if (!license.isActive) {
            return NextResponse.json({ valid: false, message: "License is disabled" }, { status: 403 });
        }

        // 3. Verificar expiración
        if (license.expiresAt && new Date() > license.expiresAt) {
            return NextResponse.json({ valid: false, message: "License expired" }, { status: 403 });
        }

        // 4. Verificar Dominio (Locking)
        // Si la licencia NO tiene dominio asignado, se lo asignamos al primero que llegue (First Use Activation)
        if (!license.lockedDomain && domain) {
            await prisma.license.update({
                where: { id: license.id },
                data: { lockedDomain: domain, lastCheckedAt: new Date() },
            });
        } else if (license.lockedDomain && domain) {
            // Si YA tiene dominio, verificamos que coincida
            // Permitimos subdominios o localhost para desarrollo si es necesario, pero por seguridad estricta: coincidencia exacta o "ends with"
            const normalizedDbDomain = license.lockedDomain.toLowerCase().replace("www.", "");
            const normalizedReqDomain = domain.toLowerCase().replace("www.", "");

            if (normalizedDbDomain !== normalizedReqDomain && !normalizedReqDomain.includes("localhost")) {
                // Opcional: Permitir localhost siempre para pruebas
                return NextResponse.json({ valid: false, message: "License domain mismatch" }, { status: 403 });
            }
        }

        // 5. Actualizar "Last Checked"
        await prisma.license.update({
            where: { id: license.id },
            data: { lastCheckedAt: new Date() },
        });

        return NextResponse.json({
            valid: true,
            message: "License valid",
            features: license.features || [] // Retornamos las features permitidas
        });

    } catch (error) {
        console.error("License check error:", error);
        return NextResponse.json({ valid: false, message: "Server error" }, { status: 500 });
    }
}
