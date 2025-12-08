
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    // Check Admin
    const user = session?.user as any;
    console.log("UPLOAD DEBUG:", {
        hasSession: !!session,
        email: user?.email,
        role: user?.role
    });

    if (!user?.email || (user.role !== "admin" && user.role !== "god")) {
        console.log("UPLOAD BLOCKED: Role mismatch or no session");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Ensure uploads directory exists
        const uploadDir = path.join(process.cwd(), "public", "uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Generate unique filename
        const ext = path.extname(file.name);
        const filename = `${uuidv4()}${ext}`;
        const filepath = path.join(uploadDir, filename);

        // Write file
        fs.writeFileSync(filepath, buffer);

        // Return public URL
        const publicUrl = `/uploads/${filename}`;
        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}

