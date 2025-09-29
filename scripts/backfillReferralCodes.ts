// scripts/backfillReferralCodes.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function genReferralCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function uniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = genReferralCode(6);
    const hit = await prisma.user.findFirst({ where: { referralCode: code }, select: { id: true } });
    if (!hit) return code;
  }
  return genReferralCode(8);
}

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ referralCode: null }, { referralCode: "" }] },
    select: { id: true },
  });

  let done = 0;
  for (const u of users) {
    const code = await uniqueCode();
    await prisma.user.update({ where: { id: u.id }, data: { referralCode: code } });
    done++;
  }

  console.log(`Backfill listo. Usuarios actualizados: ${done}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
