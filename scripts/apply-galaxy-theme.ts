
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Applying 777Galaxy theme to database...");

    try {
        const count = await prisma.$executeRaw`
      UPDATE "SystemSettings"
      SET "siteName" = '777Galaxy',
          "primaryColor" = '#10b981',
          "secondaryColor" = '#0f172a',
          "accentColor" = '#1e293b',
          "backgroundColor" = '#050b14',
          "textColor" = '#f8fafc',
          "fontFamily" = 'Inter'
    `;
        console.log(`Updated settings record(s).`);
    } catch (e) {
        console.error("Error updating values:", e);
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
