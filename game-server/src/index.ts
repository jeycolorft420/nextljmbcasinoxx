import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- TIPOS ---
interface Player {
    socketId: string;
    userId: string;
    name: string;
    isBot: boolean;
    skin: string;
    position: number; // 1 = Arriba (Host), 2 = Abajo (Retador)
}

interface RoomState {
    id: string;
    players: Player[];
    rolls: { [userId: string]: number[] };
    turnUserId: string | null;
    winner: string | null;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    timer: number;
    botTimeout?: NodeJS.Timeout;
    round: number;
}

const rooms: { [id: string]: RoomState } = {};
const socketToRoom: { [id: string]: string } = {};

io.on('connection', (socket) => {
    // 1. UNIRSE A SALA
    socket.on('join_room', async ({ roomId, user }) => {
        // Limpieza previa
        if (socketToRoom[socket.id]) leaveRoom(socket.id);

        socket.join(roomId);
        socketToRoom[socket.id] = roomId;

        // Inicializar estado si es nueva
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                rolls: {},
                turnUserId: null,
                winner: null,
                status: 'WAITING',
                timer: 30,
                round: 1
            };
        }
        const room = rooms[roomId];

        // --- RECUPERAR DATOS REALES DE LA DB ---
        let dbUser = null;
        try {
            dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        } catch (e) { console.error("DB Error", e); }

        const realSkin = dbUser?.selectedDiceColor || "white";
        const realName = dbUser?.name || user.name || "Jugador";

        // Asignar Posición: Si está vacío es el 1, si no es el 2
        let position = 1;
        if (room.players.length > 0) {
            // Si ya hay un P1, soy P2. Si ya hay un P2, soy P1 (rellenar hueco)
            const hasP1 = room.players.some(p => p.position === 1);
            position = hasP1 ? 2 : 1;
        }

        // Evitar duplicados
        const existing = room.players.find(p => p.userId === user.id);
        if (!existing) {
            room.players.push({
                socketId: socket.id,
                userId: user.id,
                name: realName,
                isBot: false,
                skin: realSkin,
                position
            });
        } else {
            existing.socketId = socket.id; // Reconexión
            existing.skin = realSkin; // Actualizar skin por si cambió
        }

        // --- LÓGICA DE BOTS Y ARRANQUE ---
        checkGameStatus(room);

        // Emitir estado actualizado
        io.to(roomId).emit('update_game', sanitize(room));
    });

    // 2. TIRAR DADOS
    socket.on('roll_dice', ({ roomId, userId }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'PLAYING') return;
        if (room.turnUserId !== userId) return; // No es tu turno
        if (room.rolls[userId]) return; // Ya tiraste

        const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        room.rolls[userId] = roll;

        io.to(roomId).emit('dice_rolled', { userId, roll });

        // Verificar si la ronda terminó o cambiar turno
        checkRound(room);
    });

    socket.on('disconnect', () => {
        leaveRoom(socket.id);
    });
});

// --- MOTOR LÓGICO ---

function checkGameStatus(room: RoomState) {
    const humans = room.players.filter(p => !p.isBot).length;
    const total = room.players.length;

    // A. INICIAR JUEGO
    if (total === 2) {
        if (room.botTimeout) clearTimeout(room.botTimeout);

        if (room.status === 'WAITING') {
            room.status = 'PLAYING';
            // P1 (Posición 1) SIEMPRE empieza
            const p1 = room.players.find(p => p.position === 1);
            room.turnUserId = p1 ? p1.userId : room.players[0].userId;

            console.log(`🎮 START: Sala ${room.id}. Turno: ${room.turnUserId}`);
            io.to(room.id).emit('update_game', sanitize(room));

            // Si P1 es bot (raro), activar
            if (p1 && p1.isBot) triggerBot(room);
        }
    }
    // B. PROGRAMAR BOT (Solo si hay 1 humano esperando)
    else if (total === 1 && humans === 1) {
        if (room.botTimeout) clearTimeout(room.botTimeout);
        // Esperar 4 segundos (Tiempo de "Cerrado de sala")
        room.botTimeout = setTimeout(() => fetchAndAddBot(room), 4000);
    }
}

async function fetchAndAddBot(room: RoomState) {
    // Verificar que siga habiendo hueco
    if (room.players.length >= 2) return;

    try {
        // --- BUSCAR BOT REAL EN DB ---
        // Excluir bots que ya estén jugando (simplificado: traer uno random)
        const botUser = await prisma.user.findFirst({
            where: { isBot: true },
            // orderBy: { updatedAt: 'asc' } // Rotación
        });

        if (botUser) {
            // Asignar hueco disponible
            const hasP1 = room.players.some(p => p.position === 1);
            const position = hasP1 ? 2 : 1;

            room.players.push({
                socketId: "bot-internal",
                userId: botUser.id,
                name: botUser.name || "Bot",
                isBot: true,
                skin: botUser.selectedDiceColor || "red",
                position
            });

            io.to(room.id).emit('player_joined', { name: botUser.name });
            checkGameStatus(room);
        }
    } catch (e) {
        console.error("Error fetching bot", e);
    }
}

function checkRound(room: RoomState) {
    const p1 = room.players.find(p => p.position === 1);
    const p2 = room.players.find(p => p.position === 2);
    if (!p1 || !p2) return;

    // Si ambos tiraron -> GANADOR
    if (room.rolls[p1.userId] && room.rolls[p2.userId]) {
        const sum1 = room.rolls[p1.userId].reduce((a, b) => a + b, 0);
        const sum2 = room.rolls[p2.userId].reduce((a, b) => a + b, 0);

        let winner = "TIE";
        if (sum1 > sum2) winner = p1.userId;
        if (sum2 > sum1) winner = p2.userId;

        room.winner = winner;
        room.status = 'FINISHED';
        io.to(room.id).emit('update_game', sanitize(room));
        io.to(room.id).emit('game_over', { winnerId: winner });

        // Nueva Ronda en 5s
        setTimeout(() => {
            if (rooms[room.id]) {
                room.round++;
                room.rolls = {};
                room.winner = null;
                room.status = 'PLAYING';
                // Alternar turno: Ronda par empieza P2
                room.turnUserId = (room.round % 2 === 0) ? p2.userId : p1.userId;
                io.to(room.id).emit('update_game', sanitize(room));

                // Check Bot Turn
                const currentTurnPlayer = room.players.find(p => p.userId === room.turnUserId);
                if (currentTurnPlayer?.isBot) triggerBot(room);
            }
        }, 5000);
    }
    // Si falta uno -> CAMBIO DE TURNO
    else {
        const nextUser = !room.rolls[p1.userId] ? p1.userId : p2.userId;
        room.turnUserId = nextUser;
        io.to(room.id).emit('update_game', sanitize(room));

        const nextPlayer = room.players.find(p => p.userId === nextUser);
        if (nextPlayer?.isBot) triggerBot(room);
    }
}

function triggerBot(room: RoomState) {
    // Humanizar: Esperar entre 2 y 4 segundos
    const delay = Math.floor(Math.random() * 2000) + 2000;
    setTimeout(() => {
        if (rooms[room.id] && room.turnUserId && room.status === 'PLAYING') {
            const player = room.players.find(p => p.userId === room.turnUserId);
            if (player && player.isBot) {
                const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
                room.rolls[player.userId] = roll;
                io.to(room.id).emit('dice_rolled', { userId: player.userId, roll });
                checkRound(room);
            }
        }
    }, delay);
}

function leaveRoom(socketId: string) {
    const roomId = socketToRoom[socketId];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.players = room.players.filter(p => p.socketId !== socketId);
    delete socketToRoom[socketId];

    // Si no quedan humanos, destruir sala (Lógica Sombra)
    const humans = room.players.filter(p => !p.isBot).length;
    if (humans === 0) {
        if (room.botTimeout) clearTimeout(room.botTimeout);
        delete rooms[roomId];
    } else {
        // Resetear a espera
        room.status = 'WAITING';
        room.rolls = {};
        room.turnUserId = null;
        // Reiniciar timer para bot
        if (room.botTimeout) clearTimeout(room.botTimeout);
        room.botTimeout = setTimeout(() => fetchAndAddBot(room), 4000);

        io.to(roomId).emit('update_game', sanitize(room));
    }
}

function sanitize(room: RoomState) {
    const { botTimeout, ...rest } = room;
    return rest;
}

httpServer.listen(4000, () => console.log("🚀 Game Server with DB Access Ready"));
