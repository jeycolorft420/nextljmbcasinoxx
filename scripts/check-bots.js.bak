
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const count = await prisma.user.count({
        where: { isBot: true }
    });
    console.log("🤖 BOT COUNT:", count);

    if (count < 11) {
        console.log("⚠️ WARNING: Less than 11 bots. Roulette needs 11 bots to fill a 12-slot room against 1 player.");
        console.log("Creating missing bots...");

        const needed = 12 - count;
        for (let i = 0; i < needed; i++) {
            await prisma.user.create({
                data: {
                    email: `bot${Date.now()}_${i}@galaxy.bot`,
                    username: `Bot_${Math.floor(Math.random() * 10000)}`,
                    password: "bot-password-hash",
                    isBot: true,
                    name: `Bot Player ${i}`
                }
            });
            process.stdout.write(".");
        }
        console.log("\n✅ Created bots.");
    } else {
        console.log("✅ Sufficient bots exist.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
