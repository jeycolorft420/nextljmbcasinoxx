import prisma from "@/lib/prisma";
import { walletCredit } from "@/lib/wallet";
import { emitRoomUpdate } from "@/lib/emit-rooms";
import { buildRoomPayload } from "@/lib/room-payload";
import { calculateRouletteOutcome, generateServerSeed, generateHash } from "@/lib/provably-fair";

export async function finishRoom(roomId: string) {
    // 🔒 Transacción con bloqueo pesimista
    return await prisma.$transaction(async (tx) => {
        // 1. Bloquear fila
        await tx.$executeRaw`SELECT 1 FROM "Room" WHERE "id" = ${roomId} FOR UPDATE`;

        // 2. Cargar estado fresco
        const roomHeader = await tx.room.findUnique({ where: { id: roomId } });
        if (!roomHeader) throw new Error("Sala no encontrada");

        // 🛡️ Safeguard: Dice Duel uses /roll
        if (roomHeader.gameType === "DICE_DUEL") {
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
        // Only if Room is mostly empty to simulate traffic? Or always fill?
        // Plan says: "Fill empty slots automatically"
        if (entries.length < room.capacity) {
            const needed = room.capacity - entries.length;
            // Select random bots that are NOT already in the room
            const existingUserIds = entries.map(e => e.userId);
            const bots = await tx.user.findMany({
                where: { isBot: true, id: { notIn: existingUserIds } },
                take: needed,
                orderBy: { id: 'asc' } // random selection difficult in Prisma w/o raw SQL, simplified here
            });

            // Add bots to entries
            for (let i = 0; i < bots.length; i++) {
                // Determine next available position
                // ROULETTE implies positions 1..Capacity. Find holes.
                const takenPositions = new Set(entries.map(e => e.position));
                let pos = 1;
                while (takenPositions.has(pos)) pos++;
                takenPositions.add(pos); // mark as taken for next iter

                const botEntry = await tx.entry.create({
                    data: {
                        roomId,
                        userId: bots[i].id,
                        position: pos,
                        round: currentRound
                    },
                    include: { user: { select: { id: true, name: true, email: true } } }
                });
                entries.push(botEntry as any); // Add to local array for winner selection
            }
        }

        // 6. Elegir Ganador
        let winningEntry: typeof entries[0] | null = null;
        let newMeta: any = room.gameMeta ?? null;

        // ROULETTE LOGIC
        if ((room as any).preselectedPosition) {
            winningEntry = entries.find(e => e.position === (room as any).preselectedPosition) ?? null;
        } else {
            // PROVABLY FAIR SELECTION
            let sSeed = room.currentServerSeed;
            // Fallback for legacy rooms without seed
            if (!sSeed) {
                sSeed = generateServerSeed();
            }

            // Construct Client Seed from Entropy (e.g., concatenated Entry IDs to ensure participation affects outcome)
            // In a real scenario, this might come from a block hash, but internal entropy is better than Math.random()
            const clientSeed = entries.map(e => e.id).sort().join("-");

            const outcomeIndex = calculateRouletteOutcome(sSeed, clientSeed, currentRound, entries.length);
            winningEntry = entries[outcomeIndex];
        }

        if (!winningEntry) throw new Error("Ganador inválido (no en ronda actual)");

        // 7. Commit Update
        const ROULETTE_MULTIPLIER = 10;
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
