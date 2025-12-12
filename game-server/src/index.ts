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
            // 1. Obtener sala y sus entradas
            const dbRoom = await prisma.room.findUnique({
                where: { id: roomId },
                include: { entries: true } // Importante: traer las entradas
            });

            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no existe' });
                return;
            }

            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            socketToUser[socket.id] = user.id;

            // 2. Instanciar lógica si no existe
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

            // 3. VERIFICAR SI EL USUARIO PAGÓ (Está en la DB)
            const isParticipant = dbRoom.entries.some(e => e.userId === user.id);

            if (isParticipant) {
                // Es jugador -> Sentarlo
                const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
                gameRoom.addPlayer(socket, {
                    ...user,
                    selectedDiceColor: dbUser?.selectedDiceColor || user.selectedDiceColor
                });
                console.log(`[Sala ${roomId}] Jugador ${user.name} conectado.`);
            } else {
                // Es mirón -> Solo enviar estado
                gameRoom.emitStateToSocket(socket);
                console.log(`[Sala ${roomId}] Espectador ${user.name} conectado.`);
            }

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
