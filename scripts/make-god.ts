
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const email = process.argv[2];

    if (!email) {
        console.log("\n❌ Error: Debes especificar el email.");
        console.log("Uso: npx tsx scripts/make-god.ts <email>");
        console.log("Ejemplo: npx tsx scripts/make-god.ts admin@casino.com\n");
        process.exit(1);
    }

    console.log(`🔍 Buscando usuario: ${email}...`);

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        console.log(`❌ No encontré ningún usuario con el email: ${email}`);
        console.log("Asegúrate de haberte registrado/logueado primero en la web.");
        process.exit(1);
    }

    console.log(`⚡ Actualizando permisos para ${user.name || "Usuario"}...`);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            role: "god",                    // Rango Máximo
            verificationStatus: "APPROVED", // Bypass KYC
            balanceCents: { increment: 100000000 } // $1,000,000 saldo testing
        },
    });

    console.log(`
✅ ¡ÉXITO!
------------------------------------------------
Usuario: ${email}
Nuevo Rol: GOD (Dios/SuperAdmin)
Estado KYC: APPROVED
Saldo Agregado: $1,000,000
------------------------------------------------
Ya puedes acceder al panel de admin en /admin/configurations
  `);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
