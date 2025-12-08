import { NextResponse } from "next/server";
import { prisma } from "@/modules/ui/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    // @ts-ignore
    if (session?.user?.role !== "admin" && session?.user?.role !== "god") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { isActive, features } = await req.json();

    // Construimos data dinámicamente
    const data: any = {};
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (features) data.features = features;

    const updated = await prisma.license.update({
        where: { id: params.id },
        data,
    });

    return NextResponse.json(updated);
}

