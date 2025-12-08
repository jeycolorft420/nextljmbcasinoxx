// src/app/api/shop/buy-skin/route.ts
import { NextResponse } from "next/server";
import { TxKind } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { z } from "zod";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Precios
const BASE_PRICE_CENTS = 100; // $1 por defecto
const SPECIAL_PRICES: Record<string, number> = {
  yellow: 200, // $2
  pink: 200,   // $2
  white: 0,    // Gratis
  dark: 100,
};
function getSkinPrice(color: string) {
  return SPECIAL_PRICES[color] ?? BASE_PRICE_CENTS;
}

// Colores permitidos
const ALLOWED = ["green", "blue", "yellow", "red", "purple", "pink", "dark", "white"] as const;
const ColorSchema = z.enum(ALLOWED);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        selectedDiceColor: true,
        diceSkins: { select: { color: true }, orderBy: { createdAt: "asc" } },
        balanceCents: true,
      },
    });
    if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

    // priceCents mantiene el “precio base” para compatibilidad;
    // priceMap expone los precios especiales por color (frontend puede usarlo si quiere).
    const priceMap = Object.fromEntries(
      ALLOWED.map(c => [c, getSkinPrice(c)])
    ) as Record<string, number>;

    return NextResponse.json({
      balanceCents: me.balanceCents,
      owned: me.diceSkins.map((s) => s.color),
      selected: me.selectedDiceColor || null,
      priceCents: BASE_PRICE_CENTS,
      priceMap,          // 👈 incluye mapa de precios por color
      allowed: ALLOWED,
    });
  } catch (e) {
    console.error("shop GET error:", e);
    return NextResponse.json({ error: "No se pudo cargar la tienda" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const color = ColorSchema.parse(String(body?.color || "").toLowerCase());
    const priceCents = getSkinPrice(color);

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, balanceCents: true, selectedDiceColor: true, diceSkins: { select: { color: true } } },
    });
    if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

    // Ya comprado
    if (me.diceSkins.some((s) => s.color === color)) {
      return NextResponse.json({ ok: true, message: "Skin ya comprado" });
    }

    if (me.balanceCents < priceCents) {
      return NextResponse.json({ error: "Saldo insuficiente" }, { status: 402 });
    }

    // Debita, registra transacción y crea skin
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
          reason: `Compra skin de dado (${color})`,
          meta: { color, priceCents },
        },
      });
      await tx.diceSkin.create({
        data: { userId: me.id, color },
      });

      // Si no había uno seleccionado, deja este como seleccionado
      if (!me.selectedDiceColor) {
        await tx.user.update({
          where: { id: me.id },
          data: { selectedDiceColor: color },
        });
      }
    });

    return NextResponse.json({ ok: true, color, chargedCents: priceCents });
  } catch (e: any) {
    console.error("shop POST error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "No se pudo comprar" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const color = ColorSchema.parse(String(body?.color || "").toLowerCase());

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, diceSkins: { select: { color: true } } },
    });
    if (!me) return NextResponse.json({ error: "Usuario no existe" }, { status: 404 });

    const owns = me.diceSkins.some((s) => s.color === color);
    if (!owns) return NextResponse.json({ error: "No posees este skin" }, { status: 403 });

    await prisma.user.update({
      where: { id: me.id },
      data: { selectedDiceColor: color },
    });

    return NextResponse.json({ ok: true, selected: color });
  } catch (e: any) {
    console.error("shop PUT error:", e?.message || e);
    return NextResponse.json({ error: e?.message || "No se pudo seleccionar skin" }, { status: 500 });
  }
}

