
import prisma from "@/modules/ui/lib/prisma";
import { maintenanceDiceDuel } from "@/modules/games/dice/lib/maintenance";
import { maintenanceRoulette } from "@/modules/games/roulette/lib/maintenance";

// Helper to determine if a room needs maintenance
export async function checkAndMaintenanceRoom(room: any) {
    const roomId = room.id;

    // 1. PRE-CHECK
    // Needs maintenance if:
    // - DADOS + OPEN/LOCKED (Always check for bots/updates)
    // - RULETA + OPEN + Timer Expired
    const isDiceDuel = room.gameType === "DICE_DUEL" && ["OPEN", "LOCKED"].includes(room.state);
    const isExpired = room.autoLockAt && new Date() > room.autoLockAt;

    if (!isDiceDuel && (room.state !== "OPEN" || !isExpired)) {
        return room;
    }

    // 2. FRESH FETCH
    const freshRoom = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
            entries: { include: { user: true } },
            _count: { select: { entries: true } }
        }
    });

    if (!freshRoom) return room;

    // 3. ROUTER
    if (freshRoom.gameType === "DICE_DUEL") {
        return await maintenanceDiceDuel(room, freshRoom);
    } else if (freshRoom.gameType === "ROULETTE") {
        // Double check expiration on fresh object
        // OR if progressive bots are enabled (botWaitMs > 0)
        const isTimerExpired = freshRoom.autoLockAt && new Date() > freshRoom.autoLockAt;
        const isProgressiveBotMode = (freshRoom.botWaitMs ?? 0) > 0;

        if (freshRoom.state === "OPEN" && (isTimerExpired || isProgressiveBotMode)) {
            return await maintenanceRoulette(room, freshRoom);
        }
    }

    return freshRoom;
}

