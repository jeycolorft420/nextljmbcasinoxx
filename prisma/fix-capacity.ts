import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔧 Fixing Dice Duel capacities...");

    const result = await prisma.room.updateMany({
        where: {
            gameType: "DICE_DUEL",
        },
        data: {
            capacity: 2,
        },
    });

    console.log(`✅ Updated ${result.count} Dice Duel rooms to capacity 2.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
