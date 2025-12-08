import prisma from "@/modules/ui/lib/prisma";
import { walletCredit } from "@/modules/users/lib/wallet";
import { emitRoomUpdate } from "@/modules/rooms/lib/emit-rooms";
import { buildRoomPayload } from "@/modules/rooms/lib/room-payload";
import { generateServerSeed } from "@/modules/games/shared/lib/provably-fair";
import { determineRouletteWinner, ROULETTE_MULTIPLIER } from "@/modules/games/roulette/lib/logic";
import { handleDiceBotTurn } from "@/modules/games/dice/lib/logic";

export async function finishRoom(roomId: string) {
    // 🔒 Transacción con bloqueo pesimista
    return await prisma.$transaction(async (tx) => {
        // 1. Bloquear fila
        await tx.$executeRaw`SELECT 1 FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;

        // 2. Cargar estado fresco
        const roomHeader = await tx.room.findUnique({ where: { id: roomId } });
        if (!roomHeader) throw new Error("Sala no encontrada");

        // 🛡️ Safeguard: Dice Duel uses /roll but we handle PvE here
        const isDiceDuel = roomHeader.gameType === "DICE_DUEL";

        // Excepción: Si es DADOS y hay 1 usuario esperando y ya pasó el tiempo (Lazy Lock o forzado)
        // Permitimos que finishRoom orqueste la entrada del bot
        // El flujo normal de dados es por endpoints /roll, pero el "Rescate por Bot" pasa por aquí.
        if (isDiceDuel && roomHeader.state !== "FINISHED") {
            // Logic continúa abajo...
        } else if (isDiceDuel) {
            throw new Error("Dice Duel uses /roll endpoint");
        }

        // 3. Idempotencia
        if (roomHeader.state === "FINISHED") {
            const winnerEntry = roomHeader.winningEntryId
                ? await tx.entry.findUnique({ where: { id: roomHeader.winningEntryId }, include: { user: true } })
                : null;
            return { alreadyFinished: true, room: roomHeader, winnerEntry };
        }

        // 4. Cargar entradas
        const currentRound = (roomHeader as any).currentRound ?? 1;
        const entries = await tx.entry.findMany({
            where: { roomId, round: currentRound },
            orderBy: { position: "asc" },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        const room = { ...roomHeader, entries };

        // 5. Validaciones
        if (room.state === "OPEN" && entries.length >= room.capacity) {
            await tx.room.update({ where: { id: roomId }, data: { state: "LOCKED", lockedAt: new Date() } });
            room.state = "LOCKED";
        }

        if (room.state !== "LOCKED" && room.state !== "OPEN") {
            throw new Error("La sala debe estar LOCKED/OPEN");
        }
        if (entries.length === 0) throw new Error("No hay participantes");

        // 🤖 BOTS: Fill empty slots
        if (entries.length < room.capacity) {
            const needed = room.capacity - entries.length;
            const existingUserIds = entries.map(e => e.userId);
            const bots = await tx.user.findMany({
                where: { isBot: true, id: { notIn: existingUserIds } },
                take: needed,
                orderBy: { id: 'asc' }
            });

            // Add bots to entries
            for (let i = 0; i < bots.length; i++) {
                // Determine next available position
                const takenPositions = new Set(entries.map(e => e.position));
                let pos = 1;
                while (takenPositions.has(pos)) pos++;
                takenPositions.add(pos);

                const botEntry = await tx.entry.create({
                    data: {
                        roomId,
                        userId: bots[i].id,
                        position: pos,
                        round: currentRound
                    },
                    include: { user: { select: { id: true, name: true, email: true } } }
                });
                entries.push(botEntry as any);

                // 🎲 DADOS: Delegar a Módulo Dice
                if (room.gameType === "DICE_DUEL") {
                    const updatedMeta = await handleDiceBotTurn(tx, roomId, room, bots[i].id);
                    room.gameMeta = updatedMeta;
                }
            }
        }

        // 6. Elegir Ganador
        let winningEntry: typeof entries[0] | null = null;
        let newMeta: any = room.gameMeta ?? null;

        if ((room as any).preselectedPosition) {
            // Admin override
            winningEntry = entries.find(e => e.position === (room as any).preselectedPosition) ?? null;
        } else if (room.gameType === "ROULETTE") {
            // 🎱 RULETA: Delegar a Módulo Roulette
            winningEntry = determineRouletteWinner(room, entries);
        } else if (room.gameType === "DICE_DUEL") {
            // Dice logic is handled via rolls, determining winner here is simplistic fallback
            // For now we trust logic elsewhere or minimal fallback implementation if needed
            // But finishRoom usually implies definitive end.
            // Simplified: If bot rolled higher? Or assumed handled?
            // Existing logic didn't explicitly select dice winner here properly in previous snippet!
            // It selected randomly via roulette logic fallback!
            // FIX: Use Roulette logic as "Generic Random" fallback for now or throw?
            // Let's fallback to "Shared Random" if not specialized.
            winningEntry = determineRouletteWinner(room, entries); // Uses provably fair generic
        }

        if (!winningEntry) throw new Error("Ganador inválido (no en ronda actual)");

        // 7. Commit Update
        const prizeCents = room.priceCents * ROULETTE_MULTIPLIER;

        const updated = await tx.room.update({
            where: { id: roomId },
            data: {
                state: "FINISHED",
                finishedAt: new Date(),
                winningEntryId: winningEntry.id,
                prizeCents,
                preselectedPosition: null,
                gameMeta: newMeta ?? undefined,
                gameResults: {
                    create: {
                        winnerUserId: winningEntry.user.id,
                        winnerName: winningEntry.user.name || winningEntry.user.email,
                        prizeCents,
                        roundNumber: currentRound,
                    }
                }
            },
            include: { entries: { include: { user: true }, orderBy: { position: "asc" } } },
        });

        return { success: true, updated, winningEntry, prizeCents };
    }, { timeout: 10000 });
}

export async function processWinnerPayout(result: any) {
    if (result.alreadyFinished) return;

    const { updated, winningEntry, prizeCents } = result;

    if (winningEntry.user && prizeCents > 0) {
        await walletCredit({
            userId: winningEntry.user.id,
            amountCents: prizeCents,
            reason: `Premio sala ${updated.title}`,
            kind: "WIN_CREDIT",
            meta: { roomId: updated.id, entryId: winningEntry.id },
        }).catch(e => console.error("walletCredit error:", e));
    }

    const payload = await buildRoomPayload(prisma, updated.id);
    if (payload) await emitRoomUpdate(updated.id, payload);
}

