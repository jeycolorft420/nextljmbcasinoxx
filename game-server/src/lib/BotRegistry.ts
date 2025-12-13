export class BotRegistry {
    private static activeBots: Set<string> = new Set();

    static add(botId: string) {
        this.activeBots.add(botId);
    }

    static remove(botId: string) {
        this.activeBots.delete(botId);
    }

    static getBot() {
        // Generar un bot aleatorio. Opcional: Validar que no estÃ© "busy" si quisiÃ©ramos,
        // pero para rellenar ruleta podemos reusar identities si es necesario, 
        // aunque idealmente generamos un ID unico cada vez.
        const id = `bot_${Math.random().toString(36).substr(2, 9)}`;
        const names = ["CryptoKing", "LuckyStrike", "BitRoller", "WhaleWatcher", "MoonBoii", "RollerCoaster", "HighStakes", "SatoshiFan", "ETH_Addict", "DogeLover", "CardShark", "RouletteGod", "SpinMaster", "JackpotHunter", "BetBigWinBig"];
        const avatars = [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Zack",
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Trouble",
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Molly"
        ];

        return {
            id,
            name: names[Math.floor(Math.random() * names.length)],
            avatar: avatars[Math.floor(Math.random() * avatars.length)]
        };
    }
}
