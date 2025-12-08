import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Validate file type (image only)
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Only images allowed" }, { status: 400 });
        }

        // Ensure uploads directory exists
        const uploadDir = path.join(process.cwd(), "public", "uploads", "verification");
        await mkdir(uploadDir, { recursive: true });

        // Generate unique filename
        const ext = path.extname(file.name);
        const filename = `${uuidv4()}${ext}`;
        const filepath = path.join(uploadDir, filename);

        await writeFile(filepath, buffer);

        const fileUrl = `/uploads/verification/${filename}`;
        return NextResponse.json({ url: fileUrl });

    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}

