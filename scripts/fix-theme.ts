
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Updating system settings to Stake theme (RAW SQL)...");

    try {
        // Try updating assuming table name is "SystemSettings" (default Prisma naming)
        const count = await prisma.$executeRaw`
      UPDATE "SystemSettings"
      SET "primaryColor" = '#10b981',
          "secondaryColor" = '#1a2c38',
          "accentColor" = '#2f4553',
          "backgroundColor" = '#0f212e',
          "textColor" = '#ffffff',
          "fontFamily" = 'Inter'
    `;
        console.log(`Updated ${count} settings record(s).`);
    } catch (e) {
        console.error("Error updating with raw SQL:", e);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
