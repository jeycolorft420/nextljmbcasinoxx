import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { frontUrl, backUrl, selfieUrl } = body;

        if (!frontUrl || !backUrl || !selfieUrl) {
            return NextResponse.json({ error: "Missing documents" }, { status: 400 });
        }

        // Store the URLs. 
        // Since our User model might only have `documentUrl` (singular) based on previous inferences,
        // we'll store them as a JSON string or focused on one.
        // However, to be robust, let's update the Prisma schema to support multiple URLs if dynamic, 
        // or just store them in `documentUrl` as a JSON string for now to avoid schema migrations in this step if possible.
        // Checking previous context, `documentUrl` exists.

        // We will save them as a JSON object string in `documentUrl`.
        const documents = {
            front: frontUrl,
            back: backUrl,
            selfie: selfieUrl
        };

        await prisma.user.update({
            where: { email: session.user.email },
            data: {
                documentUrl: JSON.stringify(documents),
                verificationStatus: "PENDING",
                rejectionReason: null // Clear previous rejections
            },
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Verification submit error:", error);
        return NextResponse.json({ error: "Failed to submit verification" }, { status: 500 });
    }
}

