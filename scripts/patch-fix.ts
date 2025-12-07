
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🛠️ Agregando columna legacy faltante 'documentUrl'...");

    // Prisma se queja de que falta documentUrl, seguramente quedó en el schema interno compilado.
    // La agregamos para que deje de molestar, aunque no la usemos (ahora usamos idFront/Back).
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "documentUrl" TEXT;`);
        console.log("✅ Columna legacy 'documentUrl' agregada.");
    } catch (e: any) {
        console.log(`⚠️ Error: ${e.message}`);
    }

    console.log("🏁 Listo. Ahora por favor ejecuta: npm run build && pm2 restart casino");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
