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

app.use(express.json()); // Enable JSON body parsing

// Endpoint HTTP para forzar reset desde la API de Next.js
app.post('/reset/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms[roomId];
    if (room) {
        room.reset();
        res.json({ success: true, message: `Room ${roomId} reset trigger sent to internal Engine.` });
    } else {
        res.status(404).json({ error: "Room not active in memory" });
    }
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
            if (!dbRoom) { socket.emit('error', { message: 'Sala no existe' }); return; }

            socket.join(roomId);
            socketToRoom[socket.id] = roomId;
            socketToUser[socket.id] = user.id;

            if (!rooms[roomId]) {
                rooms[roomId] = new DiceRoom(roomId, Number(dbRoom.priceCents), dbRoom.botWaitMs || 0, dbRoom.autoLockAt || null, dbRoom.durationSeconds || 600, io);
            }
            const gameRoom = rooms[roomId];

            // SOLO AGREGAR SI PAGÓ ENTRADA
            const isParticipant = dbRoom.entries.some(e => e.userId === user.id);
            if (isParticipant) {
                const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
                gameRoom.addPlayer(socket, { ...user, selectedDiceColor: dbUser?.selectedDiceColor || user.selectedDiceColor });
            } else {
                gameRoom.emitStateToSocket(socket); // Espectador
            }
        } catch (e) { console.error(e); }
    });

    // Evento EXCLUSIVO para comprar entrada (Botón "Comprar")
    socket.on('buy_seat', async ({ roomId, user }) => {
        try {
            // 1. Obtener la sala de memoria (debe estar iniciada por join_room alguien, si no, crearla)
            const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (!dbRoom) { socket.emit('error_msg', { message: 'Sala no existe' }); return; }

            if (!rooms[roomId]) {
                rooms[roomId] = new DiceRoom(roomId, Number(dbRoom.priceCents), dbRoom.botWaitMs || 0, dbRoom.autoLockAt || null, dbRoom.durationSeconds || 600, io);
            }
            const gameRoom = rooms[roomId];

            // 2. Intentar Agregar (Esto gatilla el Cobro Atómico)
            // Agregamos flag isBuy=true para indicar intención de compra explícita
            gameRoom.addPlayer(socket, user, false, true);

        } catch (e) { console.error(e); }
    });

    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id];
        if (room && userId) room.handleRoll(userId);
    });

    socket.on('update_skin', ({ roomId, skin }) => {
        const room = rooms[roomId];
        const userId = socketToUser[socket.id];
        if (room && userId) room.updateSkin(userId, skin);
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId && rooms[roomId]) {
            rooms[roomId].removePlayer(socket.id);
            if (rooms[roomId].players.length === 0 && rooms[roomId].status !== 'PLAYING') {
                rooms[roomId].destroy(); // Cleanup timers
                delete rooms[roomId];
            }
        }
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });

    socket.on('request_reset', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) room.reset();
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
