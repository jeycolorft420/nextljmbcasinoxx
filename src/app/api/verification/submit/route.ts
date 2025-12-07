
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

    if (base64Data.startsWith("http") || base64Data.startsWith("/")) {
        return base64Data;
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error(`Invalid base64 format for ${prefix}`);
    }

    const buffer = Buffer.from(matches[2], "base64");
    const fileName = `${prefix}-${uuidv4()}.jpg`;

    // DEBUG: Log the path we are trying to use
    const uploadDir = join(process.cwd(), "public", "uploads", "kyc");
    console.log(`Attempting to save ${prefix} to ${uploadDir}`);

    try {
        await mkdir(uploadDir, { recursive: true });
        const filePath = join(uploadDir, fileName);
        await writeFile(filePath, buffer);
        console.log(`Success: Saved ${filePath}`);
    } catch (err: any) {
        console.error(`Filesystem Error (${prefix}):`, err);
        throw new Error(`FS Error: ${err.message}`);
    }

    return `/uploads/kyc/${fileName}`;
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const {
            fullName, dob, documentId, issueDate, phoneNumber,
            photoProfile, photoIdFront, photoIdBack, photoSelfie
        } = body;

        // Basic validation
        if (!fullName || !documentId) {
            return NextResponse.json({ success: false, error: "Faltan campos (Nombre/ID)" }, { status: 400 });
        }

        // Validate Dates
        const dateOfBirth = dob ? new Date(dob) : null;
        const dateIssue = issueDate ? new Date(issueDate) : null;

        if (dob && isNaN(dateOfBirth?.getTime() || 0)) {
            return NextResponse.json({ success: false, error: "Fecha nacimiento inválida" }, { status: 400 });
        }
        if (issueDate && isNaN(dateIssue?.getTime() || 0)) {
            return NextResponse.json({ success: false, error: "Fecha expedición inválida" }, { status: 400 });
        }

        // Save images with specific error catching
        let profileUrl, frontUrl, backUrl, selfieUrl;
        try {
            profileUrl = await saveImage(photoProfile, "profile");
            frontUrl = await saveImage(photoIdFront, "front");
            backUrl = await saveImage(photoIdBack, "back");
            selfieUrl = await saveImage(photoSelfie, "selfie");
        } catch (imgErr: any) {
            return NextResponse.json({ success: false, error: `Error guardando fotos: ${imgErr.message}` }, { status: 200 });
        }

        // Database Update
        try {
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
        } catch (dbErr: any) {
            console.error("DB Error:", dbErr);
            return NextResponse.json({ success: false, error: `Error base de datos: ${dbErr.message}` }, { status: 200 });
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error("Critical KYC Error:", e);
        // Return 200 so the client can read the JSON error message
        return NextResponse.json({
            success: false,
            error: `CRITICAL ERROR: ${e.message}`
        }, { status: 200 });
    }
}
