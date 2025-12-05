import { NextResponse } from "next/server";
import { TxKind } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Datos de Skins (Hardcoded por ahora)
const SKINS: Record<string, { price: number; name: string }> = {
    "default": { price: 0, name: "Default" },
    "classic": { price: 500, name: "Classic Red/Black" },
    "vip": { price: 1000, name: "VIP Gold" },
    "cyberpunk": { price: 800, name: "Cyberpunk" },
    "matrix": { price: 800, name: "Matrix" },
};

const SkinIdSchema = z.enum(["default", "classic", "vip", "cyberpunk", "matrix"]);

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

        const me = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                id: true,
                selectedRouletteSkin: true,
                rouletteSkins: { select: { definitionId: true } },
                balanceCents: true,
            },
        });
        if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

        return NextResponse.json({
            balanceCents: me.balanceCents,
            owned: me.rouletteSkins.map(s => s.definitionId),
            selected: me.selectedRouletteSkin || "default",
            skins: SKINS,
        });
    } catch (e) {
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
}

export async function POST(req: Request) { // BUY
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const skinId = SkinIdSchema.parse(body.skinId);

        // Default es gratis y siempre se tiene
        if (skinId === "default") return NextResponse.json({ ok: true, message: "Siempre tienes default" });

        const priceCents = SKINS[skinId].price;

        const me = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, balanceCents: true, selectedRouletteSkin: true, rouletteSkins: { select: { definitionId: true } } },
        });
        if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

        if (me.rouletteSkins.some(s => s.definitionId === skinId)) {
            return NextResponse.json({ ok: true, message: "Ya lo tienes" });
        }

        if (me.balanceCents < priceCents) {
            return NextResponse.json({ error: "Saldo insuficiente" }, { status: 402 });
        }

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: me.id },
                data: { balanceCents: { decrement: priceCents } },
            });
            await tx.transaction.create({
                data: {
                    userId: me.id,
                    amountCents: -priceCents,
                    kind: TxKind.SHOP_PURCHASE,
                    reason: `Compra skin ruleta (${skinId})`,
                    meta: { skinId, priceCents },
                },
            });
            await tx.rouletteSkin.create({
                data: { userId: me.id, definitionId: skinId },
            });

            // Auto-equip si no tiene ninguno (o tiene default)
            if (!me.selectedRouletteSkin || me.selectedRouletteSkin === "default") {
                await tx.user.update({ where: { id: me.id }, data: { selectedRouletteSkin: skinId } });
            }
        });

        return NextResponse.json({ ok: true, skinId, chargedCents: priceCents });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Error al comprar" }, { status: 500 });
    }
}

export async function PUT(req: Request) { // EQUIP
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const skinId = SkinIdSchema.parse(body.skinId);

        if (skinId === "default") {
            await prisma.user.update({
                where: { email: session.user.email },
                data: { selectedRouletteSkin: "default" },
            });
            return NextResponse.json({ ok: true, selected: "default" });
        }

        const me = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, rouletteSkins: { select: { definitionId: true } } },
        });
        if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

        if (!me.rouletteSkins.some(s => s.definitionId === skinId)) {
            return NextResponse.json({ error: "No tienes este skin" }, { status: 403 });
        }

        await prisma.user.update({
            where: { id: me.id },
            data: { selectedRouletteSkin: skinId },
        });

        return NextResponse.json({ ok: true, selected: skinId });
    } catch (e) {
        return NextResponse.json({ error: "Error al equipar" }, { status: 500 });
    }
}
