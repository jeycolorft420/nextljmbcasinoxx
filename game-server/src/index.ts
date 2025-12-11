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
// Mapeo seguro SocketID -> UserID
const socketToUser: { [key: string]: string } = {};

io.on('connection', (socket) => {

    // 1. UNIRSE A SALA
    socket.on('join_room', async ({ roomId, user }) => {
        try {
            // Verificar existencia en DB
            const dbRoom = await prisma.room.findUnique({
                where: { id: roomId }
            });

            if (!dbRoom) {
                socket.emit('error', { message: 'Sala no encontrada' });
                return;
            }

            // Mapeos de sesión
            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            socketToUser[socket.id] = user.id;

            // Instanciar lógica si no existe
            if (!rooms[roomId]) {
                rooms[roomId] = new DiceRoom(
                    roomId,
                    Number(dbRoom.priceCents), // Asegurar número
                    dbRoom.botWaitMs || 0,
                    dbRoom.autoLockAt || null,
                    io
                );
            }

            const gameRoom = rooms[roomId];

            // Datos extra del usuario (Skin)
            const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

            // Añadir jugador
            gameRoom.addPlayer(socket, {
                id: user.id,
                name: dbUser?.name || user.name || "Jugador",
                skin: dbUser?.selectedDiceColor || "red",
                avatar: dbUser?.avatarUrl || ""
            }, false);

        } catch (e) {
            console.error("Error en join_room:", e);
        }
    });

    // 2. TIRAR DADOS (Securizado)
    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id]; // <--- SEGURIDAD: Obtenemos ID del socket, no del payload

        if (!userId || !room) return;

        // Delegamos lógica a la sala
        room.handleRoll(userId);
    });

    // 3. DESCONEXIÓN
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];

        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            room.removePlayer(socket.id);

            // Limpiar memoria si la sala muere (Vacía y terminada o cerrada)
            if (room.players.length === 0 && (room.status === 'CLOSED' || room.status === 'FINISHED')) {
                console.log(`[GC] Eliminando sala ${roomId} de memoria.`);
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
