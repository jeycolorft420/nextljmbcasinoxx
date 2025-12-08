// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/modules/ui/lib/prisma";

export async function POST(request: Request) {
    try {
        const { email, password, name } = await request.json();
        if (!email || !password) {
            return NextResponse.json({ error: "Email y password son requeridos" }, { status: 400 });
        }
        const hashed = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: {
                email,
                password: hashed,
                name: name ?? null,
                verificationStatus: "UNVERIFIED",
            },
        });
        return NextResponse.json({
            message: "Tu cuenta está pendiente de validación por la empresa. Por favor completa tus datos y documentos.",
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
    }
}

