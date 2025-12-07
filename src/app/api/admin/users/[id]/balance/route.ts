
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        const adminRole = (session?.user as any)?.role;

        if (adminRole !== "god") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { id } = await params;
        const body = await req.json();
        const { amountCents, Type, reason } = body; // Type: 'CREDIT' | 'DEBIT'

        if (!amountCents || !Type || !reason) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        let newBalance = user.balanceCents;
        let txKind: "REFUND" | "SHOP_PURCHASE" | "DEPOSIT" = "REFUND"; // Fallback generic

        if (Type === 'CREDIT') {
            newBalance += amountCents;
            txKind = "REFUND"; // Using REFUND as generic admin add? Or create ADMIN_ADJUSTMENT enum if possible? Schema has limited enums. 'DEPOSIT' works too.
            // Let's use 'REFUND' for Credits and 'SHOP_PURCHASE' or 'WITHDRAW' for Debits if strict. 
            // Better yet, let's stick to existing Enums.
            // CREDITS -> REFUND or DEPOSIT
            // DEBITS -> SHOP_PURCHASE (store) or WITHDRAW
        } else {
            newBalance -= amountCents;
            // Ensure non-negative? usually admin can force negative but let's be safe
            if (newBalance < 0) newBalance = 0;
        }

        // Transaction Record
        await prisma.$transaction([
            prisma.user.update({
                where: { id },
                data: { balanceCents: newBalance }
            }),
            prisma.transaction.create({
                data: {
                    userId: id,
                    amountCents: amountCents,
                    kind: Type === 'CREDIT' ? 'REFUND' : 'SHOP_PURCHASE', // Using these as proxies for Admin Adjust
                    reason: `ADMIN (${session?.user?.email}): ${reason}`,
                    meta: { adminId: (session?.user as any).id }
                }
            })
        ]);

        return NextResponse.json({ success: true, newBalance });

    } catch (error) {
        console.error("Balance Adjust Error:", error);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
