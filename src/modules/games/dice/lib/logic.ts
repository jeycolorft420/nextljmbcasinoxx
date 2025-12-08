
export function generateDiceRoll() {
    return Math.floor(Math.random() * 6) + 1;
}

export async function handleDiceBotTurn(tx: any, roomId: string, room: any, botId: string) {
    // 1. Simular rolls
    const roll1 = generateDiceRoll();
    const roll2 = generateDiceRoll();

    // 2. Guardar en gameMeta
    const currentMeta = (room.gameMeta as any) || { rolls: {} };
    currentMeta.rolls = currentMeta.rolls || {};
    currentMeta.rolls[botId] = [roll1, roll2];

    // 3. Persistir en BD
    await tx.room.update({
        where: { id: roomId },
        data: { gameMeta: currentMeta }
    });

    return currentMeta;
}
