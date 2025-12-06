import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (session?.user?.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const licenses = await prisma.license.findMany({
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(licenses);
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (session?.user?.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientName, features } = await req.json();
    if (!clientName) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Generar Key (Formato XXXX-YYYY-ZZZZ-WWWW)
    const rawUuid = uuidv4().replace(/-/g, "").toUpperCase();
    const key = `${rawUuid.slice(0, 4)}-${rawUuid.slice(4, 8)}-${rawUuid.slice(8, 12)}-${rawUuid.slice(12, 16)}`;

    const newLicense = await prisma.license.create({
        data: {
            key,
            clientName,
            features: features || [], // Guardar features
        },
    });

    return NextResponse.json(newLicense);
}
