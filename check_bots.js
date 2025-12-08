
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBots() {
    const count = await prisma.user.count({
        where: { isBot: true }
    });
    console.log(`Total Bots: ${count}`);
}

checkBots()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
