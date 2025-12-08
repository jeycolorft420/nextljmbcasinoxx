import prisma from "@/modules/ui/lib/prisma";
import crypto from "crypto";
import { emitRoomUpdate, emitRoomsIndex } from "@/modules/rooms/lib/emit-rooms";
import { Prisma } from "@prisma/client";

export async function maintenanceRoulette(room: any, freshRoom: any) {
    const roomId = room.id;
    // CRITICAL FIX: Only count players in the CURRENT ROUND.
    const currentEntries = freshRoom.entries.filter((e: any) => e.round === (freshRoom.currentRound ?? 1));
    const playersCount = currentEntries.length;

    // 0. CHECK MODE: Instant (Timer Expired) vs Progressive (Interval)
    const isTimerExpired = freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt;
    const botWaitMs = freshRoom.botWaitMs ?? 0;
    const isProgressive = botWaitMs > 0 && !isTimerExpired;

    // SCENARIO 1: Insufficient players (0) - Reset Timer (Only if expired)
    if (playersCount === 0 && isTimerExpired) {
        await prisma.room.update({
            where: { id: roomId },
            data: { autoLockAt: null }
        });
        return { ...freshRoom, autoLockAt: null };
    }

    // 🔒 ATOMIC LOCK CLAIM (CAS)
    // Only proceed if we can successfully set autoLockAt to NULL (for Instant) or if we are in Progressive mode (no lock needed yet?)
    // Actually, for Progressive, we don't want to "consume" the timer. We just want to add a bot and exit.
    // BUT we need concurrency safety.

    // PROGRESSIVE MODE LOGIC
    if (isProgressive) {
        // If room is full, we shouldn't be here (client/maintenance should have finished it? No, finish logic is below).
        if (playersCount >= freshRoom.capacity) {
            // Room is full but timer not expired. Trigger finish properly.
            // Fallthrough to Finish logic?
            // checking below...
        } else {
            // Check Last Entry Time
            const lastEntry = currentEntries[currentEntries.length - 1];
            const lastTime = lastEntry ? new Date(lastEntry.createdAt).getTime() : new Date(freshRoom.createdAt).getTime();
            const now = Date.now();

            // HUMANIZER: Add randomness/jitter to the interval (±30%)
            // This prevents robotic timing (exact 3.00s intervals).
            // Example: 5s interval becomes random between 3.5s and 6.5s
            const jitter = 0.7 + (Math.random() * 0.6);
            const customizedWait = botWaitMs * jitter;

            if (now - lastTime < customizedWait) {
                // Not enough time passed
                return freshRoom;
            }

            console.log(`[Roulette] Progressive Bot Injection for ${roomId}. Waited ${now - lastTime}ms (Target ~${customizedWait.toFixed(0)}ms)`);

            // Fetch 1 VALID Bot that isn't already playing (optional check, but simplistic for now)
            const bot = await prisma.user.findFirst({
                where: { isBot: true },
                // Random skip? or just grab one.
                take: 1,
                skip: Math.floor(Math.random() * 50) // Randomize selection slightly
            });

            if (!bot) return freshRoom;

            // Find free position
            const occupiedPositions = new Set(currentEntries.map((e: any) => e.position));
            let availablePositions = Array.from({ length: freshRoom.capacity }, (_, i) => i + 1).filter(p => !occupiedPositions.has(p));
            if (availablePositions.length === 0) return freshRoom; // Full

            const pos = availablePositions[Math.floor(Math.random() * availablePositions.length)];

            // Insert Bot
            await prisma.entry.create({
                data: {
                    roomId,
                    userId: bot.id,
                    position: pos,
                    round: freshRoom.currentRound ?? 1
                }
            });

            // Emit update
            await emitRoomUpdate(roomId);

            // Refetch to check if full now
            // If full, we can let the NEXT maintenance tick handle the finish, or fallthrough?
            // For simplicity, return now and let next tick (immediate or lazy) finish it.
            // Or better: check if (playersCount + 1 === capacity) -> Finish immediately.
            const newCount = playersCount + 1;
            if (newCount < freshRoom.capacity) {
                return freshRoom;
            }

            // If FULL, proceed to Finish Logic below...
        }
    }

    // ... FINISH LOGIC (Instant or Full) ...

    // If we are here, either:
    // A) Timer Expired (Instant Fill needed)
    // B) Room is Full (Progressive or Manual finished)

    // If Progressive and NOT Full, we should have returned above.
    // If Progressive and Full, we continue.

    // 🔒 LOCK CLAIM for FINISH
    // If timer expired, we consume autoLockAt.
    // If full, autoLockAt might be in future. We still need to lock.

    // We try to update to FINISHED state atomically?
    // Let's stick to the existing "Claim Lock" pattern to be safe.
    // If not expired but full, we can set autoLockAt = null as the claim?

    const claim = await prisma.room.updateMany({
        where: {
            id: roomId,
            // If expired, claim non-null autoLockAt.
            // If full, claim regardless?
            // To be safe/consistent: Claim if state is OPEN.
            state: "OPEN",
            // Only if we haven't already claimed it (concurrency)
            // finishedAt: null
        },
        data: { state: "LOCKED" } // Temporary Lock state to prevent double-finish
    });

    if (claim.count === 0) {
        // Already handling
        return freshRoom;
    }

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
