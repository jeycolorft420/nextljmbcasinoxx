import { NextResponse } from "next/server";
import { verifyLicense } from "@/modules/admin/lib/license-check";

export async function GET() {
    // Verificamos la licencia usando la utilidad existente
    const result = await verifyLicense();

    // Retornamos el resultado al frontend
    return NextResponse.json(result);
}

