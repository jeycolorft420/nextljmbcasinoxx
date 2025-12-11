import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 10000,
    pingInterval: 5000
});

// --- TIPOS ---
interface Player {
    socketId: string;
    userId: string;
    name: string;
    isBot: boolean;
    joinedAt: number;
}

interface Room {
    id: string;
    players: Player[];
    rolls: { [userId: string]: number[] };
    turnUserId: string | null;
    winner: string | null;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    lastActionAt: number; // Para timeouts
    round: number;
}

const rooms: { [id: string]: Room } = {};

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`🔌 Conectado: ${socket.id}`);

    socket.on('join_room', ({ roomId, user }) => {
        socket.join(roomId);

        // 1. Crear Sala si no existe
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                rolls: {},
                turnUserId: null,
                winner: null,
                status: 'WAITING',
                lastActionAt: Date.now(),
                round: 1
            };
        }

        const room = rooms[roomId];

        // 2. Añadir Jugador (Evitar duplicados de ID)
        const existing = room.players.find(p => p.userId === user.id);
        if (existing) {
            existing.socketId = socket.id; // Reconexión
        } else if (room.players.length < 2) {
            room.players.push({
                socketId: socket.id,
                userId: user.id,
                name: user.name,
                isBot: false,
                joinedAt: Date.now()
            });
        }

        // Notificar actualización
        io.to(roomId).emit('update_game', publicRoomState(room));
    });

    socket.on('roll_dice', ({ roomId, userId }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'PLAYING') return;

        // Validación suave: Si ya tiró, no dejar tirar de nuevo en esta ronda
        if (room.rolls[userId]) return;

        // Lógica del Tiro
        const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        room.rolls[userId] = roll;
        room.lastActionAt = Date.now();

        // Emitir tiro
        io.to(roomId).emit('dice_rolled', { userId, roll });

        // Cambiar turno o finalizar
        checkRoundState(room);
    });

    socket.on('disconnect', () => {
        // Buscar en qué sala estaba y quitarlo
        Object.values(rooms).forEach(room => {
            const pIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (pIndex !== -1) {
                const player = room.players[pIndex];
                // Si es humano, lo sacamos
                if (!player.isBot) {
                    room.players.splice(pIndex, 1);
                    // Si la sala se vacía de humanos, resetear
                    const humans = room.players.filter(p => !p.isBot).length;
                    if (humans === 0) delete rooms[room.id];
                    else io.to(room.id).emit('update_game', publicRoomState(room));
                }
            }
        });
    });
});

// --- GAME LOOP (EL CEREBRO) ---
// Se ejecuta cada 1 segundo para mantener todo fluyendo
setInterval(() => {
    Object.values(rooms).forEach(room => {
        const now = Date.now();

        // A. GESTIÓN DE BOTS (Si hay 1 humano esperando > 3s)
        if (room.players.length === 1 && !room.players[0].isBot && room.status === 'WAITING') {
            if (now - room.players[0].joinedAt > 3000) {
                addBot(room);
            }
        }

        // B. INICIO DE JUEGO
        if (room.players.length === 2 && room.status === 'WAITING') {
            startGame(room);
        }

        // C. JUGADA DEL BOT
        if (room.status === 'PLAYING' && room.turnUserId) {
            const playerTurn = room.players.find(p => p.userId === room.turnUserId);
            if (playerTurn?.isBot && !room.rolls[playerTurn.userId]) {
                // El bot tira si lleva esperando > 2s en su turno
                if (now - room.lastActionAt > 2000) {
                    botRoll(room, playerTurn.userId);
                }
            }
        }
    });
}, 1000);

// --- FUNCIONES AUXILIARES ---

function addBot(room: Room) {
    const botId = `bot-${Date.now()}`;
    room.players.push({
        socketId: 'bot-internal',
        userId: botId,
        name: 'Juan Bot 🤖',
        isBot: true,
        joinedAt: Date.now()
    });
    io.to(room.id).emit('update_game', publicRoomState(room));
}

function startGame(room: Room) {
    room.status = 'PLAYING';
    room.rolls = {};
    room.winner = null;
    // Asignar turno inicial (P1 siempre empieza en ronda 1)
    room.turnUserId = room.players[0].userId;
    room.lastActionAt = Date.now();

    io.to(room.id).emit('update_game', publicRoomState(room));
}

function botRoll(room: Room, botId: string) {
    const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
    room.rolls[botId] = roll;
    room.lastActionAt = Date.now();
    io.to(room.id).emit('dice_rolled', { userId: botId, roll });
    checkRoundState(room);
}

function checkRoundState(room: Room) {
    const p1 = room.players[0];
    const p2 = room.players[1];

    // Si ambos tiraron, calcular ganador
    if (room.rolls[p1.userId] && room.rolls[p2.userId]) {
        const sum1 = room.rolls[p1.userId].reduce((a, b) => a + b, 0);
        const sum2 = room.rolls[p2.userId].reduce((a, b) => a + b, 0);

        let winner = "TIE";
        if (sum1 > sum2) winner = p1.userId;
        if (sum2 > sum1) winner = p2.userId;

        room.winner = winner;
        room.status = 'FINISHED';
        room.turnUserId = null;

        io.to(room.id).emit('update_game', publicRoomState(room));
        io.to(room.id).emit('game_over', { winnerId: winner });

        // Reiniciar ronda automáticamente en 5s
        setTimeout(() => {
            if (rooms[room.id]) {
                room.round++;
                room.rolls = {};
                room.winner = null;
                room.status = 'PLAYING';
                // Alternar turno
                const starterIdx = (room.round % 2 === 0) ? 1 : 0;
                room.turnUserId = room.players[starterIdx].userId;
                room.lastActionAt = Date.now();
                io.to(room.id).emit('update_game', publicRoomState(room));
            }
        }, 5000);

    } else {
        // Si falta alguien, pasar turno
        const nextPlayer = room.players.find(p => !room.rolls[p.userId]);
        if (nextPlayer) {
            room.turnUserId = nextPlayer.userId;
            room.lastActionAt = Date.now();
            io.to(room.id).emit('update_game', publicRoomState(room));
        }
    }
}

function publicRoomState(room: Room) {
    return room; // Puedes filtrar datos sensibles aquí si fuera necesario
}

httpServer.listen(4000, () => {
    console.log('🚀 Game Server (Logic Loop) running on 4000');
});
