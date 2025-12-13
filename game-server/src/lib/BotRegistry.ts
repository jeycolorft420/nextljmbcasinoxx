export class BotRegistry {
    private static activeBots: Set<string> = new Set();

    static add(botId: string) {
        this.activeBots.add(botId);
    }

    static remove(botId: string) {
        this.activeBots.delete(botId);
    }

    static isBusy(botId: string): boolean {
        return this.activeBots.has(botId);
    }
}
