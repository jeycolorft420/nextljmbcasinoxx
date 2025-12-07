import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    // 1. Security Gate: Only GOD or ADMIN
    const currentUserRole = (session?.user as any)?.role;
    if (!session || (currentUserRole !== "god" && currentUserRole !== "admin")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { clearData } = await req.json(); // boolean

        // 2. Prepare update data
        let updateData: any = {
            verificationStatus: "UNVERIFIED",
            rejectionReason: null, // Clear any previous rejection reason
        };

        // If clearData is true, wipe everything
        if (clearData) {
            updateData = {
                ...updateData,
                documentId: null,
                issueDate: null,
                // Do NOT wipe name/dob/phone usually, but user asked for "volver a pedir datos personales"
                // Let's wipe them to force re-entry if requested.
                fullName: null,
                dob: null,
                phoneNumber: null,
                // Evidence
                profilePhotoUrl: null,
                idFrontUrl: null,
                idBackUrl: null,
                selfieUrl: null,
            };
        }

        // 3. Update
        await prisma.user.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({ success: true, message: clearData ? "Datos borrados y status reset" : "Status reset a UNVERIFIED" });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}
