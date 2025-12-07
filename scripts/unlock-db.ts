
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔓 Intentando liberar bloqueos de Base de Datos...");

    try {
        // Intenta liberar el bloqueo específico que falló (del log anterior)
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(72707369)`);
        console.log("✅ Bloqueo específico liberado.");
    } catch (e) {
        console.log("⚠️ No se pudo liberar bloqueo específico (quizás ya no existe).");
    }

    try {
        // Fuerza bruta: libera TODO
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock_all()`);
        console.log("🚀 ¡TODOS los bloqueos liberados!");
    } catch (e) {
        console.error("❌ Error al liberar todo:", e);
    }

    console.log("\nAhora intenta correr nuevamente: npx prisma migrate deploy");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
