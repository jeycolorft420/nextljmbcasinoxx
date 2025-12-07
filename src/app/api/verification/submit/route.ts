
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

// Helper to save base64 image
async function saveImage(base64Data: string, prefix: string) {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error("Invalid base64 data");
    }

    const buffer = Buffer.from(matches[2], "base64");
    const fileName = `${prefix}-${uuidv4()}.jpg`;

    // Ensure directory exists
    const uploadDir = join(process.cwd(), "public", "uploads", "kyc");
    await mkdir(uploadDir, { recursive: true });

    const filePath = join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    return `/uploads/kyc/${fileName}`;
}

// Increase body size limit for base64 images
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

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

        // Basic validation
        if (!fullName || !documentId || !photoSelfie) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Save images
        const profileUrl = photoProfile ? await saveImage(photoProfile, "profile") : null;
        const frontUrl = photoIdFront ? await saveImage(photoIdFront, "front") : null;
        const backUrl = photoIdBack ? await saveImage(photoIdBack, "back") : null;
        const selfieUrl = photoSelfie ? await saveImage(photoSelfie, "selfie") : null;

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                fullName,
                dob: new Date(dob),
                documentId,
                issueDate: new Date(issueDate),
                phoneNumber,
                profilePhotoUrl: profileUrl,
                idFrontUrl: frontUrl,
                idBackUrl: backUrl,
                selfieUrl: selfieUrl,
                verificationStatus: "PENDING"
            }
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("KYC Upload Error:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
