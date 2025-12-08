
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> } // Fix for Next.js 15 params API
) {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as any)?.role;

        if (role !== "admin" && role !== "god") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id: userId } = await params;
        const body = await req.formData();
        const action = body.get("action");

        if (action === "APPROVE") {
            await prisma.user.update({
                where: { id: userId },
                data: { verificationStatus: "APPROVED", rejectionReason: null }
            });
        } else if (action === "REJECT") {
            await prisma.user.update({
                where: { id: userId },
                data: { verificationStatus: "REJECTED", rejectionReason: "Documentación inválida o borrosa." }
            });
        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        // Revalidate the admin page to show updated list
        revalidatePath("/admin/configurations");

        // Redirect back to admin panel
        // Redirect back to admin panel using correct host
        const host = req.headers.get("host") || "localhost:3000";
        const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
        return NextResponse.redirect(`${protocol}://${host}/admin/configurations`);

    } catch (error) {
        console.error("Verification action error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

