
import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({ message: "Debug endpoint working!", time: new Date().toISOString() });
}

export async function POST(req: Request) {
    try {
        const text = await req.text();
        return NextResponse.json({
            message: "Debug POST working",
            length: text.length,
            preview: text.substring(0, 50)
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

