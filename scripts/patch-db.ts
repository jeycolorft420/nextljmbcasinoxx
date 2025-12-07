
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🛠️ Iniciando reparación manual de la Base de Datos...");

    // Array of raw SQL commands to add missing columns safely
    const commands = [
        // Verification Status
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED';`,

        // Personal Data
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fullName" TEXT;`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dob" TIMESTAMP(3);`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "documentId" TEXT;`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3);`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;`,

        // Photos
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePhotoUrl" TEXT;`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "idFrontUrl" TEXT;`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "idBackUrl" TEXT;`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selfieUrl" TEXT;`,
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;`,

        // Username (Unique)
        `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;`,
        // Index handled separately usually, but basic constraint:
        `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`
    ];

    for (const sql of commands) {
        try {
            await prisma.$executeRawUnsafe(sql);
            console.log(`✅ Ejecutado: ${sql.substring(0, 50)}...`);
        } catch (e: any) {
            console.log(`⚠️ Advertencia (puede ser normal si ya existe): ${e.message}`);
        }
    }

    console.log("🏁 Reparación finalizada. Las columnas deberían existir ahora.");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
