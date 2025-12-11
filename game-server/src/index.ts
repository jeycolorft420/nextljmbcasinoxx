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

// Mapa de Salas en Memoria
const rooms: { [key: string]: DiceRoom } = {};
const socketToRoom: { [key: string]: string } = {};

io.on('connection', (socket) => {

    socket.on('join_room', async ({ roomId, user }) => {
        try {
            const dbRoom = await prisma.room.findUnique({
                where: { id: roomId },
                include: { entries: true }
            });

            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no encontrada' });
                return;
            }

            socket.join(roomId);
            socketToRoom[socket.id] = roomId;

            // Instanciar con tiempos de bot y cierre
            if (!rooms[roomId]) {
                rooms[roomId] = new DiceRoom(
                    roomId,
                    Number(dbRoom.priceCents),
                    dbRoom.botWaitMs || 0, // Timeout para bot
                    dbRoom.autoLockAt || null, // Cierre automático
                    io
                );
            }

            const gameRoom = rooms[roomId];

            if (!user || !user.id) {
                socket.emit('error', { message: 'Invalid user data' });
                return;
            }

            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

            gameRoom.addPlayer(socket, {
                id: user.id,
                name: dbUser?.name || user.name || "Jugador",
                skin: dbUser?.selectedDiceColor || "red",
                avatar: dbUser?.avatarUrl || ""
            }, false);

        } catch (e) {
            console.error("Error joining room:", e);
        }
    });

    socket.on('roll_dice', ({ roomId, userId }) => {
        const room = rooms[roomId];
        if (room) {
            room.handleRoll(userId);
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];

            // Notificar salida a la sala (limpia si está en WAITING)
            room.removePlayer(socket.id);

            // Limpieza de memoria si la sala está vacía y en estado terminal o waiting
            // Para evitar fugas de memoria, si está WAITING y tiene 0 jugadores, se borra.
            if (room.players.length === 0 && (room.status === 'CLOSED' || room.status === 'FINISHED' || room.status === 'WAITING')) {
                console.log(`[RC] Sala ${roomId} eliminada de memoria (vacía).`);
                delete rooms[roomId];
            }

            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Dice Duel Server corriendo en puerto ${PORT}`);
});
