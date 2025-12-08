import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = 'force-dynamic';

// GET: Fetch current settings
// GET: Fetch current settings
export async function GET() {
    try {
        // Try to find existing settings
        let settings = await prisma.systemSettings.findFirst();

        if (!settings) {
            // Return defaults if no settings found
            return NextResponse.json({
                siteName: "777Galaxy",
                logoUrl: "",
                faviconUrl: "",
                diceCoverUrl: "",
                rouletteCoverUrl: "",
                primaryColor: "#10b981",
                secondaryColor: "#0f172a",
                accentColor: "#1e293b",
                backgroundColor: "#050b14",
                textColor: "#f8fafc",
                fontFamily: "Inter"
            });
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
    }
}

// PUT: Update settings
export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);

    // Check Admin
    // @ts-ignore
    if (!session?.user?.email || (session.user.role !== "admin" && session.user.role !== "god")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { siteName, logoUrl, faviconUrl, diceCoverUrl, rouletteCoverUrl, primaryColor, secondaryColor, accentColor, backgroundColor, textColor, fontFamily, diceTimerSeconds } = body;

        // Update the first record (singleton pattern)
        // We use updateMany to avoid needing the ID, or findFirst then update
        const first = await prisma.systemSettings.findFirst();

        let settings;
        if (first) {
            settings = await prisma.systemSettings.update({
                where: { id: first.id },
                data: {
                    siteName,
                    logoUrl,
                    faviconUrl,
                    diceCoverUrl,
                    rouletteCoverUrl,
                    primaryColor,
                    secondaryColor,
                    accentColor,
                    backgroundColor,
                    textColor,
                    fontFamily,
                    diceTimerSeconds: typeof diceTimerSeconds === 'number' ? diceTimerSeconds : undefined,
                },
            });
        } else {
            settings = await prisma.systemSettings.create({
                data: {
                    siteName,
                    logoUrl,
                    faviconUrl,
                    diceCoverUrl,
                    rouletteCoverUrl,
                    primaryColor,
                    secondaryColor,
                    accentColor,
                    backgroundColor,
                    textColor,
                    fontFamily,
                    diceTimerSeconds: typeof diceTimerSeconds === 'number' ? diceTimerSeconds : 600,
                },
            });
        }

        return NextResponse.json(settings);
    } catch (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json({ error: "Failed to update settings", details: String(error) }, { status: 500 });
    }
}

