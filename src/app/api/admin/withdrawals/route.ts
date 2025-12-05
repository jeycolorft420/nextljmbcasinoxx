// src/app/api/admin/withdrawals/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");      // "pending"
    const q = searchParams.get("q");                // email search
    const recent = searchParams.get("recent");      // e.g., "5"
    const take = Math.min(Number(searchParams.get("take") ?? "200"), 500);

    // ── BÚSQUEDA POR EMAIL ────────────────────────────────────────────────
    if (q) {
      const query = q.trim();
      if (!query) return NextResponse.json([]);
      const withdrawals = await prisma.withdrawal.findMany({
        where: {
          user: {
            is: {
              // Tu versión de Prisma no soporta `mode: "insensitive"`
              // Si tu DB es case-insensitive por collation, esto bastará.
              email: { contains: query },
            },
          },
        },
        include: { user: { select: { id: true, email: true, name: true} } },
        orderBy: { createdAt: "desc" },
        take,
      });
      return NextResponse.json(withdrawals);
    }

    // ── SOLO PENDIENTES ───────────────────────────────────────────────────
    if (status === "pending") {
      const withdrawals = await prisma.withdrawal.findMany({
        where: { status: "pending" },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take,
      });
      return NextResponse.json(withdrawals);
    }

    // ── ÚLTIMOS REVISADOS (finished/rejected), por updatedAt DESC ────────
    if (recent) {
      const limit = Math.min(Math.max(parseInt(recent, 10) || 5, 1), 50);
      const withdrawals = await prisma.withdrawal.findMany({
        where: { status: { in: ["finished", "rejected"] } },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { updatedAt: "desc" },
        take: limit,
      });
      return NextResponse.json(withdrawals);
    }

    // ── LEGACY/FALLBACK: lista completa ───────────────────────────────────
    const withdrawals = await prisma.withdrawal.findMany({
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json(withdrawals);
  } catch (e) {
    console.error("admin/withdrawals GET error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
