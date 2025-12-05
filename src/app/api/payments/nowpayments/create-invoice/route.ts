// src/app/api/payments/nowpayments/create-invoice/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const Body = z
  .object({
    usdAmount: z.number().positive().optional(),
    amountCents: z.number().int().positive().optional(),
  })
  .refine((v) => v.usdAmount != null || v.amountCents != null, {
    message: "usdAmount o amountCents es requerido",
    path: ["usdAmount"],
  })
  .transform((v) => ({
    usdAmount:
      v.usdAmount != null
        ? Number(v.usdAmount)
        : Number((v.amountCents! / 100).toFixed(2)),
  }));

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { usdAmount } = Body.parse(await req.json());

    // mínimo $15
    if (usdAmount < 15) {
      return NextResponse.json({ error: "El mínimo de recarga es $15.00" }, { status: 400 });
    }

    const API_KEY = process.env.NOWPAYMENTS_API_KEY;
    const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
    const base =
      process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

    if (!API_KEY) {
      return NextResponse.json({ error: "Falta NOWPAYMENTS_API_KEY" }, { status: 500 });
    }

    const orderId = `ord_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const payment = await prisma.payment.create({
      data: {
        userId,
        amountCents: Math.round(usdAmount * 100),
        currency: "USD",
        status: "pending",
        orderId,
        successUrl: `${base}/dashboard?status=success`,
        cancelUrl: `${base}/dashboard?status=cancel`,
      },
    });

    const payload = {
      price_amount: usdAmount,
      price_currency: "usd",
      order_id: orderId,
      order_description: "Wallet deposit",
      success_url: payment.successUrl,
      cancel_url: payment.cancelUrl,
      ipn_callback_url: `${base}/api/payments/nowpayments/ipn`,
      is_fee_paid_by_user: true,
    };

    const res = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        ...(IPN_SECRET ? { "x-ipn-secret": IPN_SECRET } : {}),
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      console.error("create-invoice error:", json);
      return NextResponse.json(
        { error: `NOWPayments error: ${json?.message || res.statusText}` },
        { status: 500 }
      );
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        npPaymentId: json?.id?.toString?.() ?? null,
        raw: json,
      },
    });

    return NextResponse.json({
      ok: true,
      invoice_url: json.invoice_url,
      orderId,
    });
  } catch (err: any) {
    if (err?.issues) {
      console.error("create-invoice error:", err.issues);
      return NextResponse.json(err.issues, { status: 500 });
    }
    console.error("create-invoice fatal:", err);
    return NextResponse.json({ error: "Error creando invoice" }, { status: 500 });
  }
}
