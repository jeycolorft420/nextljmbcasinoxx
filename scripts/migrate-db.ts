
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Manually migrating database schema...");

    const columns = [
        { name: "primaryColor", type: "TEXT", default: "'#10b981'" },
        { name: "secondaryColor", type: "TEXT", default: "'#1a2c38'" },
        { name: "accentColor", type: "TEXT", default: "'#2f4553'" },
        { name: "backgroundColor", type: "TEXT", default: "'#0f212e'" },
        { name: "textColor", type: "TEXT", default: "'#ffffff'" },
        { name: "fontFamily", type: "TEXT", default: "'Inter'" },
    ];

    for (const col of columns) {
        try {
            // Check if column exists (Postgres specific)
            // Actually, just try adding it. If it exists, it will fail, which is fine.
            await prisma.$executeRawUnsafe(`
        ALTER TABLE "SystemSettings" 
        ADD COLUMN "${col.name}" ${col.type} DEFAULT ${col.default};
      `);
            console.log(`Added column ${col.name}`);
        } catch (e: any) {
            if (e.message.includes("already exists")) {
                console.log(`Column ${col.name} already exists.`);
            } else {
                console.log(`Error adding ${col.name}:`, e.message);
            }
        }
    }

    console.log("Updating values to Stake theme...");
    try {
        const count = await prisma.$executeRaw`
      UPDATE "SystemSettings"
      SET "primaryColor" = '#10b981',
          "secondaryColor" = '#1a2c38',
          "accentColor" = '#2f4553',
          "backgroundColor" = '#0f212e',
          "textColor" = '#ffffff',
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
