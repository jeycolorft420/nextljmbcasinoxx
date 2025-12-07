// src/app/api/me/profile/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true, referralCode: true, twoFactorEnabled: true,
      verificationStatus: true, documentUrl: true, rejectionReason: true
    },
  });

  return NextResponse.json(me);
}

const Body = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(60, "Máximo 60 caracteres"),
});

async function parseBody(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = await req.json().catch(() => ({}));
    return Body.parse(json);
  }
  // soporta POST de formularios simples
  const form = await req.formData().catch(() => null);
  if (form) {
    const name = String(form.get("name") || "");
    return Body.parse({ name });
  }
  throw new Error("Formato no soportado");
}

export async function POST(req: Request) {
  return PATCH(req);
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { name } = await parseBody(req);

    const updated = await prisma.user.update({
      where: { email },
      data: { name },
      select: { id: true, name: true, email: true, role: true, referralCode: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (e: any) {
    const msg = e?.issues?.[0]?.message || e?.message || "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
