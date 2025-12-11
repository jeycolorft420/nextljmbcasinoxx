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

// Mapa de Salas en Memoria: roomId -> Instancia DiceRoom
const rooms: { [key: string]: DiceRoom } = {};
// Mapa de Socket -> roomId (para saber de dónde desconectar)
const socketToRoom: { [key: string]: string } = {};

io.on('connection', (socket) => {

    // --- JOIN ROOM ---
    socket.on('join_room', async ({ roomId, user }) => {
        try {
            // 1. Validar que la sala exista en DB y obtener su precio
            // Esto es importante para saber cuánto vale la apuesta inicial
            const dbRoom = await prisma.room.findUnique({
                where: { id: roomId },
                include: { entries: true }
            });

            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no encontrada' });
                return;
            }

            // 2. Unir al socket al canal de socket.io
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;

            // 3. Instanciar lógica de sala si no existe en memoria
            if (!rooms[roomId]) {
                // Ensure priceCents is a number (handle BigInt if necessary, though here assumed number/int)
                // If your prisma schema uses BigInt for price, you might need Number(dbRoom.priceCents)
                rooms[roomId] = new DiceRoom(roomId, Number(dbRoom.priceCents), io);
            }

            const gameRoom = rooms[roomId];

            // 4. Obtener datos reales del usuario (Skin, Avatar)
            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

            // 5. Añadir jugador a la lógica
            gameRoom.addPlayer(socket, {
                id: user.id,
                name: dbUser?.name || user.name || "Jugador",
                skin: dbUser?.selectedDiceColor || "red", // Skin por defecto
                avatar: dbUser?.avatarUrl || ""
            }, false); // isBot = false

        } catch (e) {
            console.error("Error joining room:", e);
        }
    });

    // --- ROLL DICE ---
    socket.on('roll_dice', ({ roomId, userId }) => {
        const room = rooms[roomId];
        if (room) {
            room.handleRoll(userId);
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].removePlayer(socket.id);
            // Limpieza: Si la sala queda vacía por mucho tiempo, podrías borrarla de memoria
            delete socketToRoom[socket.id];
        }
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Dice Duel Server corriendo en puerto ${PORT}`);
});
