
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const BOT_NAMES = [
    "LuckyStriker", "CryptoKing", "SatoshiFan", "MoonWalker", "DiamondHands",
    "AlphaWolf", "OmegaBet", "CasinoRoyale", "HighRoller", "JackpotHunter",
    "CoinMaster", "BetZilla", "GambleGod", "RiskTaker", "WinStream",
    "GalaxyPilot", "NebulaSurfer", "Starlight", "CosmicBet", "AstroLuck",
    "MarsRover", "PlutoPunter", "VenusViper", "SaturnRing", "JupiterGiant",
    "MercurySpeed", "TerraFirma", "SolarFlare", "LunarEclipse", "CometChaser",
    "BlackHole", "SuperNova", "BigBang", "ZeroGravity", "SpaceCadet",
    "RocketMan", "StarLord", "VoidWalker", "QuantumLeap", "EventHorizon",
    "DarkMatter", "LightSpeed", "WarpDrive", "TimeTraveler", "AlienHunter",
    "UFOspotter", "Area51Visitor", "RoswellNative", "CropCircle", "SkyWatcher"
];

async function main() {
    console.log("🌱 Seeding bots...");

    const passwordHash = await hash("bot-password-secure-123", 10);

    for (const name of BOT_NAMES) {
        const email = `${name.toLowerCase()}@bot.777galaxy.online`;

        await prisma.user.upsert({
            where: { email },
            update: {
                isBot: true,
                name: name,
                avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`, // Nice avatars
            },
            create: {
                email,
                password: passwordHash,
                name: name,
                isBot: true,
                avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
                balanceCents: 1000000, // $10,000 fake balance
            },
        });
    }

    console.log(`✅ ${BOT_NAMES.length} bots seeded successfully!`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
