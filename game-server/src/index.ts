import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { DiceRoom } from './DiceRoom';
import { RouletteRoom } from './RouletteRoom';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json()); // Necesario para POST vacíos o body

app.post('/reset/:id', async (req, res) => {
    const { id } = req.params;
    const room = rooms[id];
    if (room) {
        await room.reset();
        console.log(`[API] Sala ${id} reseteada forzosamente.`);
        return res.json({ ok: true });
    }
    return res.status(404).json({ error: "Room not in memory" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io"
});

const prisma = new PrismaClient();
// Usamos any para evitar problemas de tipos interseccion "never" entre clases dispares
const rooms: { [key: string]: any } = {};

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('join_room', async (payload) => {
        const { roomId, user } = payload;
        socket.join(roomId);
        socket.data.user = user;
        socket.data.roomId = roomId;

        let room = rooms[roomId];

        if (!room) {
            const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (dbRoom) {
                if (dbRoom.gameType === 'ROULETTE') {
                    const duration = dbRoom.durationSeconds || 1200;
                    const botFill = dbRoom.botWaitMs || 300000;
                    room = new RouletteRoom(
                        roomId,
                        Number(dbRoom.priceCents),
                        dbRoom.capacity,
                        dbRoom.autoLockAt,
                        duration,
                        botFill,
                        io
                    );
                } else {
                    // DiceRoom constructor match: (id, price, botWait, autoLock, duration, io)
                    room = new DiceRoom(
                        roomId,
                        Number(dbRoom.priceCents),
                        dbRoom.botWaitMs || 0,
                        dbRoom.autoLockAt,
                        dbRoom.durationSeconds || 600,
                        io
                    );
                }
                rooms[roomId] = room;
            }
        }

        if (room) {
            // Ambos aceptan (socket, user, isBot, isBuyAttempt)
            // En DiceRoom isBuyAttempt puede ser opcional o default false, pero ya vimos que lo acepta.
            await room.addPlayer(socket, user, false, false);

            // Roulette tiene metodo especial para emitir estado inicial al socket
            if (room instanceof RouletteRoom) {
                room.emitStateToSocket(socket);
            }
        }
    });

    socket.on('buy_seat', async (payload) => {
        const { roomId, user, positions, count } = payload; // Added positions and count destructuring
        socket.join(roomId);

        let room = rooms[roomId];
        if (!room) {
            const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
            if (dbRoom) {
                if (dbRoom.gameType === 'ROULETTE') {
                    room = new RouletteRoom(
                        roomId,
                        Number(dbRoom.priceCents),
                        dbRoom.capacity,
                        dbRoom.autoLockAt,
                        dbRoom.durationSeconds || 1200, // 20 min default
                        dbRoom.botWaitMs || 300000,    // 5 min default (Phase 2 duration)
                        io
                    );
                } else {
                    room = new DiceRoom(roomId, Number(dbRoom.priceCents), dbRoom.botWaitMs || 0, dbRoom.autoLockAt, dbRoom.durationSeconds || 600, io);
                }
                rooms[roomId] = room;
            }
        }
        if (room) {
            // Pass requested positions or count to addPlayer
            // DiceRoom will ignore extra args, RouletteRoom will use them.
            await room.addPlayer(socket, user, false, true, positions, count);
            if (room instanceof RouletteRoom) {
                room.emitStateToSocket(socket);
            }
        }
    });

    // Eventos Específicos
    socket.on('roll_dice', ({ roomId }) => {
        const room = rooms[roomId];
        if (room instanceof DiceRoom && socket.data.user?.id) {
            room.handleRoll(socket.data.user.id);
        }
    });

    // Eventos Comunes
    socket.on('update_skin', ({ roomId, skin }) => {
        const room = rooms[roomId];
        // Solo DiceRoom tiene skins por ahora
        if (room instanceof DiceRoom && socket.data.user?.id) {
            room.updateSkin(socket.data.user.id, skin);
        }
    });

    // --- NUEVO: EVENTO DE RENDICIÓN ---
    socket.on('forfeit_game', ({ roomId }) => {
        const room = rooms[roomId];
        // Solo DiceRoom tiene forfeit 1vs1 por ahora
        if (room instanceof DiceRoom && socket.data.user?.id) {
            console.log(`[Socket] Usuario ${socket.data.user.id} se rinde en sala ${roomId}`);
            room.playerForfeit(socket.data.user.id);
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
