
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";

const GOD_PIN = process.env.GOD_MODE_PIN || "777777";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = session?.user as any;

        if (!user || user.role !== "god") {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        }

        const body = await req.json();
        if (body.code !== GOD_PIN) {
            return NextResponse.json({ error: "Código incorrecto" }, { status: 400 });
        }

        // Set unlock cookie
        const cookieStore = await cookies();
        cookieStore.set("admin_unlocked", "true", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 4, // 4 hours
            path: "/"
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
