import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const email = "jeyco@gmial.com"; // As requested
    const emailCorrect = "jeyco@gmail.com"; // Just in case

    console.log(`Updating role for ${email} and ${emailCorrect}...`);

    try {
        const u1 = await prisma.user.update({
            where: { email },
            data: { role: "god" },
        });
        console.log(`Updated ${email} to GOD role.`);
    } catch (e) {
        console.log(`User ${email} not found or error.`);
    }

    try {
        const u2 = await prisma.user.update({
            where: { email: emailCorrect },
            data: { role: "god" },
        });
        console.log(`Updated ${emailCorrect} to GOD role.`);
    } catch (e) {
        console.log(`User ${emailCorrect} not found or error.`);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
