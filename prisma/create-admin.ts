import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const email = "jeyco@gmail.com";
    const password = "Admin123!"; // Contraseña temporal segura
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`Creating/Updating admin user: ${email}...`);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            role: "god",
            verificationStatus: "APPROVED",
            password: hashedPassword, // Reset password just in case
        },
        create: {
            email,
            password: hashedPassword,
            role: "god",
            verificationStatus: "APPROVED",
            name: "Super Admin",
            balanceCents: 1000000, // 10,000.00 saldo inicial
        },
    });

    console.log(`✅ User ${user.email} created/updated successfully.`);
    console.log(`🔑 Password: ${password}`);
    console.log(`🛡️ Role: ${user.role}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
