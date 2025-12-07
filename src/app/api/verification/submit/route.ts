
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

// Helper to save base64 image
async function saveImage(base64Data: string, prefix: string) {
    if (!base64Data) return null;

    // Check if it's already a URL (in case of re-submission or edit)
    if (base64Data.startsWith("http") || base64Data.startsWith("/")) {
        return base64Data;
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        // Fallback or error
        console.error("Invalid base64 for", prefix);
        return null;
    }

    const buffer = Buffer.from(matches[2], "base64");
    const fileName = `${prefix}-${uuidv4()}.jpg`;

    // Ensure directory exists
    // Using process.cwd()/public/uploads/kyc
    const uploadDir = join(process.cwd(), "public", "uploads", "kyc");
    try {
        await mkdir(uploadDir, { recursive: true });
        const filePath = join(uploadDir, fileName);
        await writeFile(filePath, buffer);
        console.log(`Saved ${prefix} to ${filePath}`);
    } catch (err) {
        console.error(`Error saving file ${fileName}:`, err);
        throw new Error(`Failed to save image ${prefix}`);
    }

    return `/uploads/kyc/${fileName}`;
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const {
            fullName, dob, documentId, issueDate, phoneNumber,
            photoProfile, photoIdFront, photoIdBack, photoSelfie
        } = body;

        console.log("Received KYC submission:", {
            fullName, dob, documentId, issueDate,
            hasProfile: !!photoProfile,
            hasFront: !!photoIdFront
        });

        // Basic validation
        if (!fullName || !documentId) {
            return NextResponse.json({ error: "Faltan campos obligatorios (Nombre o ID)" }, { status: 400 });
        }

        // Validate Dates
        const dateOfBirth = dob ? new Date(dob) : null;
        const dateIssue = issueDate ? new Date(issueDate) : null;

        if (dob && isNaN(dateOfBirth?.getTime() || 0)) {
            return NextResponse.json({ error: "Fecha de nacimiento inválida" }, { status: 400 });
        }
        if (issueDate && isNaN(dateIssue?.getTime() || 0)) {
            return NextResponse.json({ error: "Fecha de expedición inválida" }, { status: 400 });
        }

        // Save images
        const profileUrl = await saveImage(photoProfile, "profile");
        const frontUrl = await saveImage(photoIdFront, "front");
        const backUrl = await saveImage(photoIdBack, "back");
        const selfieUrl = await saveImage(photoSelfie, "selfie");

        console.log("Images saved, updating DB...");

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                fullName,
                dob: dateOfBirth,
                documentId,
                issueDate: dateIssue,
                phoneNumber,
                profilePhotoUrl: profileUrl,
                idFrontUrl: frontUrl,
                idBackUrl: backUrl,
                selfieUrl: selfieUrl,
                verificationStatus: "PENDING"
            }
        });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error("KYC Upload Error:", e);
        // Return the actual error message to help debugging
        return NextResponse.json({
            error: "Error interno del servidor: " + (e.message || e.toString())
        }, { status: 500 });
    }
}
