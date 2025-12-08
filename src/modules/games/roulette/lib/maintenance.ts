import prisma from "@/modules/ui/lib/prisma";
import crypto from "crypto";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";
import { Prisma } from "@prisma/client";

export async function maintenanceRoulette(room: any, freshRoom: any) {
    const roomId = room.id;
    // CRITICAL FIX: Only count players in the CURRENT ROUND.
    const currentEntries = freshRoom.entries.filter((e: any) => e.round === (freshRoom.currentRound ?? 1));
    const playersCount = currentEntries.length;

    // 0. CHECK MODE: Extension Phase (Progressive Fill AFTER Timer) vs Instant
    const isTimerExpired = freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt;
    const botFillDurationMs = freshRoom.botWaitMs ?? 0;

    // Legacy support: if botWaitMs is 0, we fill instantly when timer expires.
    const isLegacyInstantFill = isTimerExpired && botFillDurationMs === 0;

    // New Logic: If timer expired AND botWaitMs > 0, we enter "Extension Phase"
    const isExtensionPhase = isTimerExpired && botFillDurationMs > 0;

    // SCENARIO 1: Insufficient players (0) - Reset Timer (Only if expired)
    // If 0 players, we probably shouldn't start filling bots? Or yes?
    // User requirement: "Wait... then bots enter". So yes, even if 0 players.
    // BUT, if 0 players, maybe we just reset without bots to save resources? 
    // Let's stick to current behavior: If 0 REAL players, reset timer to avoid empty rooms spinning.
    if (playersCount === 0 && isTimerExpired) {
        await prisma.room.update({
            where: { id: roomId },
            data: { autoLockAt: null }
        });
        return { ...freshRoom, autoLockAt: null };
    }

    // 🔒 ATOMIC LOCK CLAIM (CAS)
    // Only claim lock if we are finishing/filling instantly.
    // If in extension phase, we don't lock yet, we just add bots one by one.

    // EXTENSION PHASE LOGIC (Progressive Fill)
    if (isExtensionPhase) {
        const botsNeeded = freshRoom.capacity - playersCount;

        if (botsNeeded <= 0) {
            // Room is full! Now we can proceed to FINISH it safely.
            // Fallthrough to Finish Logic below.
        } else {
            // We need to add bots. Calculate dynamic interval.
            // Interval = TotalDuration / RemainingBots
            // e.g. 60s / 10 bots = 6s per bot.
            const baseInterval = botFillDurationMs / botsNeeded;

            // HUMANIZER: Add jitter (±30%)
            const jitter = 0.7 + (Math.random() * 0.6);
            const targetInterval = baseInterval * jitter;

            // Check Last Entry Time
            // If we just entered extension phase, lastEntry might be old. 
            // We should use `Math.max(lastEntryTime, autoLockAt)`? 
            // Actually, comparing to lastEntry.createdAt is fine. If it was long ago, it will trigger immediately (good).
            const lastEntry = currentEntries[currentEntries.length - 1];
            const lastTime = lastEntry ? new Date(lastEntry.createdAt).getTime() : new Date(freshRoom.createdAt).getTime();
            const now = Date.now();

            if (now - lastTime < targetInterval) {
                // Wait more
                return freshRoom;
            }

            console.log(`[Roulette] Extension Bot Injection for ${roomId}. Needed: ${botsNeeded}. Interval: ~${(targetInterval / 1000).toFixed(1)}s`);

            // Inject ONE Bot
            const bot = await prisma.user.findFirst({
                where: { isBot: true },
                take: 1,
                skip: Math.floor(Math.random() * 50)
            });

            if (!bot) return freshRoom;

            // Find free position
            const occupiedPositions = new Set(currentEntries.map((e: any) => e.position));
            let availablePositions = Array.from({ length: freshRoom.capacity }, (_, i) => i + 1).filter(p => !occupiedPositions.has(p));
            if (availablePositions.length === 0) return freshRoom; // Should be covered by botsNeeded check, but safety.

            const pos = availablePositions[Math.floor(Math.random() * availablePositions.length)];

            await prisma.entry.create({
                data: {
                    roomId,
                    userId: bot.id,
                    position: pos,
                    round: freshRoom.currentRound ?? 1
                }
            });

            await emitRoomUpdate(roomId);

            // Return here. We wait for next tick to either add more or finish.
            return freshRoom;
        }
    } else if (!isTimerExpired) {
        // Timer NOT expired. Normal state. Do nothing.
        return freshRoom;
    }

    // ... FINISH LOGIC (Instant Legacy OR Extension Complete) ...
    // relationships:
    // If Legacy Instant: isTimerExpired && bots needed -> Fill all.
    // If Extension: we only fallthrough here if botsNeeded <= 0 (Full).

    // We need to be careful not to trigger Legacy Fill if we are in Extension Mode but not full yet (handled by return above).

    const claim = await prisma.room.updateMany({
        where: {
            id: roomId,
            state: "OPEN",
        },
        data: { state: "LOCKED" }
    });

    if (claim.count === 0) return freshRoom;

    // ... continue to existing finish logic ...


    // Double check state after lock? (Not needed if atomic update to LOCKED worked)

    // SCENARIO 2: Fill with Bots (If needed)
    // Refetch strictly to be sure
    const lockedRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: { entries: { where: { round: freshRoom.currentRound ?? 1 } } }
    });

    // ... [Original Logic Resume] ...
    const entries = lockedRoom?.entries || [];
    let currentCount = entries.length;
    let botsNeeded = freshRoom.capacity - currentCount;
    if (botsNeeded < 0) botsNeeded = 0;

    console.log(`[Roulette] Finish sequence for ${roomId}. Bots needed: ${botsNeeded}`);

    // If bots needed (Timer Expired case), fetch and fill
    if (botsNeeded > 0) {
        const bots = await prisma.user.findMany({
            where: { isBot: true },
            take: botsNeeded,
            orderBy: { createdAt: 'desc' }
        });

        if (bots.length < botsNeeded) {
            console.warn(`[Roulette] Not enough bots. Restoring.`);
            await prisma.room.update({ where: { id: roomId }, data: { state: "OPEN" } });
            return freshRoom;
        }

        // Fill logic (copy-paste adapted)
        const occupied = new Set(entries.map((e: any) => e.position));
        let available = Array.from({ length: freshRoom.capacity }, (_, i) => i + 1).filter(p => !occupied.has(p));
        available.sort(() => Math.random() - 0.5);

        const toCreate = bots.map((b, i) => ({
            roomId, userId: b.id, position: available[i], round: freshRoom.currentRound ?? 1
        }));

        if (toCreate.length > 0) await prisma.entry.createMany({ data: toCreate });
    }

    // 4. Refetch FINAL for winner
    const finalRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: { entries: { where: { round: freshRoom.currentRound ?? 1 }, include: { user: true } } }
    });

    if (!finalRoom || finalRoom.entries.length === 0) {
        // Should not happen, but revert if so
        await prisma.room.update({ where: { id: roomId }, data: { state: "OPEN" } });
        return freshRoom;
    }

    const finalEntries = finalRoom.entries;
    const winnerIndex = crypto.randomInt(0, finalEntries.length);
    const winner = finalEntries[winnerIndex];
    const prize = finalRoom.priceCents * 10;

    // 6. Execute Payout & Finish
    const updatedRoom = await prisma.$transaction(async (tx) => {
        const r = await tx.room.update({
            where: { id: roomId },
            data: {
                state: "FINISHED",
                finishedAt: new Date(),
                lockedAt: new Date(),
                winningEntryId: winner.id,
                prizeCents: prize,
                preselectedPosition: null,
                autoLockAt: null
            },
            include: { entries: { where: { round: freshRoom.currentRound ?? 1 }, include: { user: true } } }
        });

        await tx.user.update({
            where: { id: winner.userId },
            data: { balanceCents: { increment: prize } }
        });

        await tx.transaction.create({
            data: {
                userId: winner.userId,
                amountCents: prize,
                kind: "WIN_CREDIT",
                reason: `Victoria en Sala ${r.title}`,
                meta: { roomId: r.id }
            }
        });

        await tx.gameResult.create({
            data: {
                roomId: r.id,
                winnerUserId: winner.userId,
                winnerName: winner.user.name ?? "Jugador",
                prizeCents: prize,
                roundNumber: freshRoom.currentRound ?? 1
            }
        });

        return r;
    });

    await emitRoomUpdate(updatedRoom.id);
    await emitRoomsIndex();

    return updatedRoom;
}
