
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

// Force Dynamic (fixes some static gen issues)
export const dynamic = 'force-dynamic';

// Helper to save base64 image
async function saveImage(base64Data: string | null | undefined, prefix: string) {
    if (!base64Data) return null;

    // If it's a URL, return it
    if (typeof base64Data === 'string' && (base64Data.startsWith("http") || base64Data.startsWith("/"))) {
        return base64Data;
    }

    // Validate format
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        console.error(`Invalid base64 header for ${prefix}`);
        return null; // Don't throw, just skip saving this one
    }

    const buffer = Buffer.from(matches[2], "base64");
    const fileName = `${prefix}-${uuidv4()}.jpg`;

    const uploadDir = join(process.cwd(), "public", "uploads", "kyc");

    try {
        await mkdir(uploadDir, { recursive: true });
        const filePath = join(uploadDir, fileName);
        await writeFile(filePath, buffer);
        console.log(`Saved: ${fileName}`);
        return `/uploads/kyc/${fileName}`;
    } catch (err: any) {
        console.error(`Save Error (${prefix}):`, err);
        throw new Error(`Write Failed: ${err.message}`);
    }
}

export async function POST(req: Request) {
    console.log("KYC Submit: Request received"); // LOG 1

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
        }

        console.log("KYC Submit: Reading body...");

        let body;
        try {
            body = await req.json();
            console.log("KYC Submit: Body parsed. Keys:", Object.keys(body));
        } catch (parseError: any) {
            console.error("JSON Parse Error:", parseError);
            return NextResponse.json({ success: false, error: "Payload demasiado grande o JSON inválido" }, { status: 400 });
        }

        const {
            fullName, dob, documentId, issueDate, phoneNumber,
            photoProfile, photoIdFront, photoIdBack, photoSelfie
        } = body;

        // Validations
        if (!fullName || !documentId) {
            return NextResponse.json({ success: false, error: "Faltan datos personales" }, { status: 400 });
        }

        // Processing Images
        console.log("KYC Submit: Saving images...");

        const profileUrl = await saveImage(photoProfile, "profile");
        const frontUrl = await saveImage(photoIdFront, "front");
        const backUrl = await saveImage(photoIdBack, "back");
        const selfieUrl = await saveImage(photoSelfie, "selfie");

        // Database
        console.log("KYC Submit: Updating DB...");
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                fullName,
                dob: dob ? new Date(dob) : null,
                documentId,
                issueDate: issueDate ? new Date(issueDate) : null,
                phoneNumber,
                profilePhotoUrl: profileUrl,
                idFrontUrl: frontUrl,
                idBackUrl: backUrl,
                selfieUrl: selfieUrl,
                verificationStatus: "PENDING"
            }
        });

        console.log("KYC Submit: Success!");
        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error("KYC CRITICAL FAILURE:", e);
        return NextResponse.json({
            success: false,
            error: `Error Servidor: ${e.message}`
        }, { status: 200 });
    }
}
