// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

// Evita crear múltiples clientes en dev con HMR.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // log: ["query", "error", "warn"], // <- útil si quieres ver queries
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

