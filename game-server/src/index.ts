// game-server/src/index.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { DiceRoom } from './DiceRoom';

const prisma = new PrismaClient();
const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms: { [key: string]: DiceRoom } = {};
const socketToRoom: { [key: string]: string } = {};
const socketToUser: { [key: string]: string } = {};

io.on('connection', (socket) => {

    socket.on('join_room', async ({ roomId, user }) => {
        try {
            const dbRoom = await prisma.room.findUnique({
                where: { id: roomId },
                include: { entries: true }
            });

            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no existe' });
                return;
            }

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

            if (!user || !user.id) {
                socket.emit('error', { message: 'Invalid user data' });
                return;
            }

            // Find current DB Entry for this user in this room
            const myEntry = dbRoom.entries.find(e => e.userId === user.id);
            // If entry missing (rare if just joined via API), fallback to ID or fake
            const entryId = myEntry ? myEntry.id : `temp-${user.id}`;

            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

            gameRoom.addPlayer(socket, {
                id: user.id,
                entryId: entryId, // Pass correct Entry ID
                name: dbUser?.name || user.name || "Jugador",
                skin: dbUser?.selectedDiceColor || "red",
                avatar: dbUser?.avatarUrl || ""
            }, false);

        } catch (e) {
            console.error("Error join_room:", e);
        }
    });

    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id];

        if (!userId) {
            console.log(`[Seguridad] Intento de tiro sin usuario autenticado: ${socket.id}`);
            return;
        }

        if (room) {
            room.handleRoll(userId);
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            room.removePlayer(socket.id);
            if (room.players.length === 0 && (room.status === 'CLOSED' || room.status === 'FINISHED' || room.status === 'OPEN')) {
                delete rooms[roomId];
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
