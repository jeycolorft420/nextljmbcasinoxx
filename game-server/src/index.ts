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
            // Validar existencia
            const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no existe' });
                return;
            }

            // Mapeos
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            socketToUser[socket.id] = user.id;

            // Instanciar
            if (!rooms[roomId]) {
                rooms[roomId] = new DiceRoom(
                    roomId,
                    Number(dbRoom.priceCents),
                    dbRoom.botWaitMs || 0,
                    dbRoom.autoLockAt || null,
                    io
                );
            }

            // Añadir jugador
            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
            rooms[roomId].addPlayer(socket, {
                ...user,
                // Usamos skin de DB o el que manda el front, preferencia DB
                selectedDiceColor: dbUser?.selectedDiceColor || user.selectedDiceColor
            });

        } catch (e) {
            console.error(e);
        }
    });

    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id];
        if (room && userId) {
            room.handleRoll(userId);
        }
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].removePlayer(socket.id);
            // Limpiar si vacía
            if (rooms[roomId].players.length === 0 && rooms[roomId].status !== 'PLAYING') {
                delete rooms[roomId];
            }
        }
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Game Server Ready on ${PORT}`);
});
