// src/app/api/admin/support/threads/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role as string | undefined;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    // filtros opcionales
    const status = searchParams.get("status") as "open" | "closed" | null;
    const q = searchParams.get("q")?.trim() || null;

    // paginación opcional
    const takeParam = Number(searchParams.get("take"));
    const skipParam = Number(searchParams.get("skip"));
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(takeParam, 200) : 200;
    const skip = Number.isFinite(skipParam) && skipParam >= 0 ? skipParam : 0;

    // where dinámico
    const where: any = {};

    if (status === "open" || status === "closed") {
      where.status = status;
    }

    if (q) {
      // Sin `mode: "insensitive"` por compatibilidad.
      // Los correos normalmente están en minúsculas.
      where.OR = [
        { user: { is: { email: { contains: q } } } },
        { guestEmail: { contains: q } },
      ];
    }

    const threads = await prisma.supportThread.findMany({
      where,
      orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
      select: {
        id: true,
        subject: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        guestEmail: true,
        guestName: true,
      },
      take,
      skip,
    });

    return NextResponse.json(threads);
  } catch (err: any) {
    console.error("GET /api/admin/support/threads error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
