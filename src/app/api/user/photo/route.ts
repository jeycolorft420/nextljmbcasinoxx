// src/app/api/user/photo/route.ts
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
    const file = formData.get("photo") as File | null;
    if (!file) {
        return NextResponse.json({ error: "Archivo no proporcionado" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
        return NextResponse.json({ error: "Tipo de archivo no válido. Solo se permiten imágenes." }, { status: 400 });
    }

    const ext = path.extname(file.name) || ".jpg";
    const uploadDir = path.join(process.cwd(), "public", "uploads", "profile");
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, `${user.id}${ext}`);
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/profile/${user.id}${ext}`;
    await prisma.user.update({
        where: { id: user.id },
        data: { profilePhotoUrl: publicUrl },
    });

    return NextResponse.json({ message: "Foto actualizada", url: publicUrl });
}
