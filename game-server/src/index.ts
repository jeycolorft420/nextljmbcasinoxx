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
// 👇 NUEVO: Mapa de seguridad para saber quién es dueño de qué socket
const socketToUser: { [key: string]: string } = {};

io.on('connection', (socket) => {

    // --- JOIN ROOM (Aquí registramos la identidad) ---
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

            // Registrar socket en los mapas
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            socketToUser[socket.id] = user.id; // <--- VINCULACIÓN SEGURA

            // Instanciar sala si no existe
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

            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

            gameRoom.addPlayer(socket, {
                id: user.id,
                name: dbUser?.name || user.name || "Jugador",
                skin: dbUser?.selectedDiceColor || "red",
                avatar: dbUser?.avatarUrl || ""
            }, false);

        } catch (e) {
            console.error("Error join_room:", e);
        }
    });

    // --- ROLL DICE (BLINDADO) ---
    // Ya no pedimos userId, lo sacamos del socket.
    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id]; // <--- IDENTIDAD VERIFICADA

        if (!userId) {
            console.log(`[Seguridad] Intento de tiro sin usuario autenticado: ${socket.id}`);
            return;
        }

        if (room) {
            // El servidor decide si es tu turno, no el cliente.
            room.handleRoll(userId);
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        // const userId = socketToUser[socket.id]; // Recuperamos quién era (unused but good for logging)

        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];

            // Notificar salida a la sala (limpia si está en WAITING)
            room.removePlayer(socket.id);

            // Limpieza si la sala muere
            if (room.players.length === 0 && (room.status === 'CLOSED' || room.status === 'FINISHED' || room.status === 'OPEN')) {
                delete rooms[roomId];
            }
        }

        // Limpiar mapas
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Dice Duel Server corriendo en puerto ${PORT}`);
});
