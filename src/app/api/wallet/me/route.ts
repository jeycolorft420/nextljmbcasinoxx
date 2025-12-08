import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import prisma from "@/modules/ui/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  console.log("Wallet/Me - Session:", session?.user?.email); // 👈 DEBUG
  if (!session?.user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, balanceCents: true, selectedRouletteSkin: true },
  });
  console.log("Wallet/Me - User Found:", !!user); // 👈 DEBUG
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json(user);
}

