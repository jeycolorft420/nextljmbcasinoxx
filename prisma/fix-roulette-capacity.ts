import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔧 Fixing Roulette capacities...");

    const result = await prisma.room.updateMany({
        where: {
            gameType: "ROULETTE",
        },
        data: {
            capacity: 12,
        },
    });

    console.log(`✅ Updated ${result.count} Roulette rooms to capacity 12.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
