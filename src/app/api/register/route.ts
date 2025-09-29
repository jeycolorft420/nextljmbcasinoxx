// src/app/api/register/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { z } from "zod";

const prisma = new PrismaClient();

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(2).max(50).optional(),
  // opcional – por si en algún flujo lo envías en el body
  refCode: z.string().min(3).max(24).optional(),
});

// Normaliza el código (evita confusiones con 0/O, 1/I)
function normalizeRef(code?: string | null) {
  if (!code) return undefined;
  return code.toUpperCase().trim().replace(/0/g, "O").replace(/1/g, "I");
}

// Genera un código único y legible (sin I/O/0/1)
async function generateUniqueReferralCode(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  while (true) {
    let code = "";
    for (let i = 0; i < 7; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    // 👇 usar findFirst vs findUnique da igual, pero aquí usamos findUnique porque el campo es @unique
    const exists = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!exists) return code;
  }
}

export async function POST(req: Request) {
  try {
    // 1) Leemos ref de la query y del body (la query tiene prioridad)
    const url = new URL(req.url);
    const refFromQuery = normalizeRef(url.searchParams.get("ref"));

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, name, refCode } = parsed.data;

    // 2) Evita duplicados
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "Email ya registrado" }, { status: 409 });
    }

    // 3) Resuelve el candidato a referidor (query > body) y búscalo EXACTO
    const refCandidate = normalizeRef(refFromQuery ?? refCode);
    let referredById: string | undefined;

    if (refCandidate) {
      // ⚠️ Importante: el campo referralCode en tu schema es String? @unique
      // Usamos findUnique para aprovechar el índice único y evitar ambigüedad.
      const referrer = await prisma.user.findUnique({
        where: { referralCode: refCandidate },
        select: { id: true },
      });

      if (referrer) referredById = referrer.id;
      // (si no existe, seguimos sin romper el registro)
    }

    // 4) Crear usuario con referredById (si lo hubo) y su propio referralCode único
    const hash = await bcrypt.hash(password, 10);
    const myReferralCode = await generateUniqueReferralCode();

    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        name,
        referralCode: myReferralCode, // mi código
        referredById,                 // quién me refirió (si se resolvió)
      },
      select: {
        id: true,
        email: true,
        name: true,
        referralCode: true,
        referredById: true, // 👈 lo devolvemos para que lo veas al vuelo
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (err) {
    console.error("register error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
