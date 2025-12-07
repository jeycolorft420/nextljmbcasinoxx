import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    // 1. Security Gate: Only GOD or ADMIN can access
    const currentUserRole = (session?.user as any)?.role;
    if (!session || (currentUserRole !== "god" && currentUserRole !== "admin")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { role } = await req.json();

        // 2. Validation: Only allow "user" or "admin"
        if (role !== "user" && role !== "admin") {
            return NextResponse.json({ error: "Rol inválido. Solo 'user' o 'admin' permitidos." }, { status: 400 });
        }

        // 3. TARGET Security: Prevent modifying a GOD user
        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

        if (targetUser.role === "god") {
            return NextResponse.json({ error: "⚠️ No puedes modificar a un DIOS." }, { status: 403 });
        }

        // 4. Update
        await prisma.user.update({
            where: { id },
            data: { role }
        });

        return NextResponse.json({ success: true, role });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
