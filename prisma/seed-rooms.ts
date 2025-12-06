import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DENOMINATIONS = [1, 5, 10, 25, 50, 100];
const GAMES = ["DICE_DUEL", "ROULETTE"] as const;

async function main() {
    console.log("🌱 Seeding rooms...");

    for (const game of GAMES) {
        for (const amount of DENOMINATIONS) {
            // Create 2 rooms for each denomination
            for (let i = 1; i <= 2; i++) {
                const title = `${game === "DICE_DUEL" ? "Dados" : "Ruleta"} $${amount} #${i}`;
                const priceCents = amount * 100;
                const capacity = game === "DICE_DUEL" ? 2 : 12;

                await prisma.room.create({
                    data: {
                        title,
                        priceCents,
                        gameType: game,
                        capacity,
                        state: "OPEN",
                    },
                });
                console.log(`Created: ${title}`);
            }
        }
    }

    console.log("✅ Seeding complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
