
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";
import { verifyLicense } from "@/modules/admin/lib/license-check";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const role = (session?.user as any)?.role;

        if (role !== "god" && role !== "admin") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { key } = await req.json();

        if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });

        // Ensure settings exist
        const settings = await prisma.systemSettings.findFirst();
        if (!settings) {
            await prisma.systemSettings.create({
                data: {
                    licenseKey: key
                }
            });
        } else {
            await prisma.systemSettings.update({
                where: { id: settings.id },
                data: { licenseKey: key }
            });
        }

        // Trigger verification immediately
        const result = await verifyLicense();

        return NextResponse.json({ success: true, result });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to update license" }, { status: 500 });
    }
}

