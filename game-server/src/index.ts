import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { DiceRoom } from './DiceRoom';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io"
});

const prisma = new PrismaClient();
const rooms: { [key: string]: DiceRoom } = {};

io.on('connection', (socket) => {
    // ... (resto de eventos join_room, buy_seat, etc que ya tenías) ...

    socket.on('join_room', async (payload) => {
        const { roomId, user } = payload;
        socket.join(roomId);

        // Guardar datos del usuario en el socket para usarlos luego
        socket.data.user = user;
        socket.data.roomId = roomId;

        let room = rooms[roomId];
        if (!room) {
            const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (dbRoom) {
                rooms[roomId] = new DiceRoom(
                    roomId,
                    Number(dbRoom.priceCents),
                    dbRoom.botWaitMs || 0,
                    dbRoom.autoLockAt,
                    dbRoom.durationSeconds || 600,
                    io
                );
                room = rooms[roomId];
            }
        }

        if (room) {
            // Solo unirse como observador o reconectar si ya existe en memoria
            room.addPlayer(socket, user, false, false);
        }
    });

    socket.on('buy_seat', async (payload) => {
        const { roomId, user } = payload;
        socket.join(roomId);
        socket.data.user = user;
        socket.data.roomId = roomId;

        let room = rooms[roomId];
        if (!room) {
            const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (dbRoom) {
                rooms[roomId] = new DiceRoom(
                    roomId,
                    Number(dbRoom.priceCents),
                    dbRoom.botWaitMs || 0,
                    dbRoom.autoLockAt,
                    dbRoom.durationSeconds || 600,
                    io
                );
                room = rooms[roomId];
            }
        }

        if (room) {
            // Intento de compra
            await room.addPlayer(socket, user, false, true);
        }
    });

    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socket.data.user?.id;
        if (room && userId) {
            room.handleRoll(userId);
        }
    });

    socket.on('update_skin', ({ roomId, skin }) => {
        const room = rooms[roomId];
        const userId = socket.data.user?.id;
        if (room && userId) {
            room.updateSkin(userId, skin);
        }
    });

    // --- NUEVO: EVENTO DE RENDICIÓN ---
    socket.on('forfeit_game', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socket.data.user?.id;
        if (room && userId) {
            console.log(`[Socket] Usuario ${userId} se rinde en sala ${roomId}`);
            room.playerForfeit(userId);
        }
    });

    socket.on('disconnect', () => {
        const { roomId } = socket.data;
        if (roomId && rooms[roomId]) {
            rooms[roomId].removePlayer(socket.id);
        }
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Game Server running on port ${PORT}`);
});
