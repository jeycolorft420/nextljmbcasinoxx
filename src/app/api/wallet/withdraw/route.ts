import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { walletDebit } from "@/lib/wallet";

const schema = z.object({
  userId: z.string().min(1),
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).default("Retiro administrativo"),
  meta: z.any().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "god") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { userId, amountCents, reason, meta } = schema.parse(await req.json());
  try {
    await walletDebit({ userId, amountCents, reason, kind: "WITHDRAW", meta });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "No se pudo debitar" }, { status: 400 });
  }
}
