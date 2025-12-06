// src/app/api/admin/verification/[id]/action/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function POST(request: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    // Only admin or god can perform actions
    if (role !== "admin" && role !== "god") {
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const formData = await request.formData();
    const action = (formData.get("action") as string | null)?.toUpperCase();
    if (!action || (action !== "APPROVE" && action !== "REJECT")) {
        return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }

    const userId = params.id;

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { verificationStatus: action === "APPROVE" ? "APPROVED" : "REJECTED" },
        });
        // Redirect back to configurations page after action
        return NextResponse.json({ message: `Usuario ${action.toLowerCase()}ado` });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Error al actualizar el usuario" }, { status: 500 });
    }
}
