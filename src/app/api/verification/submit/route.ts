// src/app/api/verification/submit/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email as string } });
    if (!user) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const fullName = formData.get("fullName") as string | null;
    const documentFile = formData.get("document") as File | null;
    const selfieFile = formData.get("selfie") as File | null;

    if (!fullName || !documentFile || !selfieFile) {
        return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // Prepare upload directory
    const uploadDir = path.join(process.cwd(), "public", "uploads", "verification", user.id);
    await fs.mkdir(uploadDir, { recursive: true });

    // Helper to save a file
    const saveFile = async (file: File, suffix: string) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const ext = path.extname(file.name) || ".jpg";
        const filePath = path.join(uploadDir, `${suffix}${ext}`);
        await fs.writeFile(filePath, buffer);
        // Return public URL relative to /public
        return `/uploads/verification/${user.id}/${suffix}${ext}`;
    };

    const documentUrl = await saveFile(documentFile, "document");
    const selfieUrl = await saveFile(selfieFile, "selfie");

    await prisma.user.update({
        where: { id: user.id },
        data: {
            fullName,
            documentUrl,
            selfieUrl,
            // Keep status as PENDING; admin will later approve.
        },
    });

    return NextResponse.json({
        message: "Datos de verificación enviados. Espera la aprobación del administrador.",
        documentUrl,
        selfieUrl,
    });
}
