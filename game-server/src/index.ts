import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient, RoomState } from '@prisma/client';
import { DiceRoom } from './DiceRoom';

const prisma = new PrismaClient();
const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms: { [key: string]: DiceRoom } = {}; // TODO: Union type when RouletteRoom exists
const socketToRoom: { [key: string]: string } = {};
const socketToUser: { [key: string]: string } = {};

// --- STARTUP CLEANUP ---
async function cleanZombieRooms() {
    try {
        console.log("[Startup] Cleaning up zombie rooms...");
        // Close rooms that are "OPEN" or "LOCKED" (Prisma enums) that might be stuck
        const { count } = await prisma.room.updateMany({
            where: { state: { in: [RoomState.OPEN, RoomState.LOCKED] } },
            data: { state: RoomState.FINISHED } // Or FINISHED/CLOSED depending on schema
        });
        console.log(`[Startup] Closed ${count} zombie rooms.`);
    } catch (e) {
        console.error("[Startup] Error cleaning rooms:", e);
    }
}
cleanZombieRooms();
// -----------------------

io.on('connection', (socket) => {

    socket.on('join_room', async ({ roomId, user }) => {
        try {
            const dbRoom = await prisma.room.findUnique({
                where: { id: roomId },
                select: {
                    id: true,
                    gameType: true, // Check Game Type
                    priceCents: true,
                    botWaitMs: true,
                    autoLockAt: true,
                    entries: true
                }
            });

            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no encontrada' });
                return;
            }

            // Identify Game Logic. Note: gameType enum might be DICE_DUEL
            if (dbRoom.gameType === 'DICE_DUEL') {
                // --- DICE LOGIC ---
                socket.join(roomId);
                socketToRoom[socket.id] = roomId;
                socketToUser[socket.id] = user.id;

                if (!rooms[roomId]) {
                    rooms[roomId] = new DiceRoom(
                        roomId,
                        Number(dbRoom.priceCents),
                        dbRoom.botWaitMs || 0,
                        dbRoom.autoLockAt || null,
                        io
                    );
                }

                const gameRoom = rooms[roomId];
                const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

                // Entry ID Logic
                const myEntry = dbRoom.entries.find(e => e.userId === user.id);
                const entryId = myEntry ? myEntry.id : `temp-${user.id}`;

                gameRoom.addPlayer(socket, {
                    id: user.id,
                    entryId: entryId,
                    name: dbUser?.name || user.name || "Jugador",
                    skin: dbUser?.selectedDiceColor || "red",
                    avatar: dbUser?.avatarUrl || ""
                }, false);

            } else if (dbRoom.gameType === 'ROULETTE') {
                // --- ROULETTE LOGIC (Placeholder) ---
                console.log(`[Roulette] Player ${user.id} joined roulette room ${roomId} (Logic Pending)`);
                socket.emit('error', { message: 'Servidor de Ruleta en mantenimiento/actualización' });
            } else {
                socket.emit('error', { message: `Tipo de juego no soportado: ${dbRoom.gameType}` });
            }

        } catch (e) {
            console.error("Error en join_room:", e);
        }
    });

    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id];

        if (!userId || !room) return;
        // Check if room is actually a DiceRoom instance? (Current `rooms` is typed as DiceRoom map)
        if (room instanceof DiceRoom) {
            room.handleRoll(userId);
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];

        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];

            if (room instanceof DiceRoom) {
                room.removePlayer(socket.id);
                // GC
                if (room.players.length === 0 && (room.status === 'CLOSED' || room.status === 'FINISHED')) {
                    console.log(`[GC] Eliminando sala ${roomId} de memoria.`);
                    delete rooms[roomId];
                }
            }
        }

        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Dice Duel Server corriendo en puerto ${PORT}`);
});
