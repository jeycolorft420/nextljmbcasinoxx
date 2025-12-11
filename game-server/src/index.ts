import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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
}

interface Room {
    id: string;
    players: Player[];
    rolls: { [userId: string]: number[] };
    turnUserId: string | null;
    winner: string | null;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    botTimeout?: NodeJS.Timeout; // Guardamos el timer para cancelarlo si entra humano
}

const rooms: { [id: string]: Room } = {};
const socketToRoom: { [id: string]: string } = {}; // Mapa rápido para desconexión

io.on('connection', (socket) => {
    console.log(`🔌 Conectado: ${socket.id}`);

    // 1. UNIRSE
    socket.on('join_room', ({ roomId, user }) => {
        // Si el usuario ya estaba en otra sala (por refresh), sacarlo
        if (socketToRoom[socket.id]) leaveRoom(socket.id);

        socket.join(roomId);
        socketToRoom[socket.id] = roomId;

        // Crear sala limpia si no existe
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                rolls: {},
                turnUserId: null,
                winner: null,
                status: 'WAITING'
            };
        }
        const room = rooms[roomId];

        // Verificar si ya está (evitar duplicados visuales)
        const exists = room.players.find(p => p.userId === user.id);
        if (!exists) {
            room.players.push({
                socketId: socket.id,
                userId: user.id,
                name: user.name,
                isBot: false,
                skin: user.selectedDiceColor || "white"
            });
        } else {
            exists.socketId = socket.id; // Actualizar socket ID tras reconexión
        }

        // SI HAY 2 JUGADORES (Humano vs Humano o Humano vs Bot) -> INICIAR
        if (room.players.length === 2) {
            // Cancelar cualquier bot que fuera a entrar
            if (room.botTimeout) clearTimeout(room.botTimeout);
            startGame(room);
        }
        // SI ESTÁ SOLO -> Programar Bot en 3 segundos
        else if (room.players.length === 1) {
            if (room.botTimeout) clearTimeout(room.botTimeout);
            room.botTimeout = setTimeout(() => addBot(room), 3000);
        }

        io.to(roomId).emit('update_game', sanitize(room));
    });

    // 2. TIRAR DADOS
    socket.on('roll_dice', ({ roomId, userId }) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'PLAYING') return;
        if (room.turnUserId !== userId) return; // No es tu turno
        if (room.rolls[userId]) return; // Ya tiraste

        // Ejecutar tiro
        const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        room.rolls[userId] = roll;
        io.to(roomId).emit('dice_rolled', { userId, roll });

        // Verificar estado
        checkTurn(room);
    });

    // 3. DESCONEXIÓN
    socket.on('disconnect', () => {
        leaveRoom(socket.id);
    });
});

// --- FUNCIONES LÓGICAS ---

function leaveRoom(socketId: string) {
    const roomId = socketToRoom[socketId];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    // Quitar jugador
    room.players = room.players.filter(p => p.socketId !== socketId);
    delete socketToRoom[socketId];

    // REGLA DE ORO: Si no quedan humanos, BORRAR LA SALA.
    // Esto evita que Juan Bot se quede viviendo ahí.
    const humans = room.players.filter(p => !p.isBot).length;
    if (humans === 0) {
        if (room.botTimeout) clearTimeout(room.botTimeout);
        delete rooms[roomId];
        console.log(`🧹 Sala ${roomId} eliminada (vacía)`);
        return;
    }

    // Si queda un humano solo (el otro se fue), reiniciar estado
    room.status = 'WAITING';
    room.rolls = {};
    room.winner = null;
    room.turnUserId = null;
    // Programar nuevo bot si se queda solo mucho tiempo
    if (room.botTimeout) clearTimeout(room.botTimeout);
    room.botTimeout = setTimeout(() => addBot(room), 3000);

    io.to(roomId).emit('update_game', sanitize(room));
}

function addBot(room: Room) {
    // Seguridad: No meter bot si ya hay 2 jugadores
    if (room.players.length >= 2) return;

    const botId = "bot-juan";
    room.players.push({
        socketId: "bot-socket",
        userId: botId,
        name: "Juan Bot 🤖",
        isBot: true,
        skin: "red"
    });

    io.to(room.id).emit('update_game', sanitize(room));
    startGame(room);
}

function startGame(room: Room) {
    room.status = 'PLAYING';
    room.rolls = {};
    room.winner = null;
    // Siempre empieza el primer jugador de la lista (el anfitrión)
    room.turnUserId = room.players[0].userId;

    console.log(`🎮 Juego iniciado en ${room.id} - Turno: ${room.turnUserId}`);
    io.to(room.id).emit('update_game', sanitize(room));
}

function checkTurn(room: Room) {
    const p1 = room.players[0];
    const p2 = room.players[1];
    if (!p1 || !p2) return;

    // A. Si ambos tiraron -> Calcular Ganador
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

        // Reiniciar en 4s
        setTimeout(() => {
            if (rooms[room.id]) {
                room.rolls = {};
                room.winner = null;
                room.status = 'PLAYING';
                // Alternar turno simple: El ganador empieza (o random)
                room.turnUserId = winner !== "TIE" ? winner : p1.userId;
                io.to(room.id).emit('update_game', sanitize(room));

                // Si le toca al bot, que tire
                if (room.turnUserId === "bot-juan") botPlay(room);
            }
        }, 4000);
        return;
    }

    // B. Si falta alguien -> Pasar turno
    const nextUserId = !room.rolls[p1.userId] ? p1.userId : p2.userId;
    room.turnUserId = nextUserId;
    io.to(room.id).emit('update_game', sanitize(room));

    // Si le toca al Bot, ejecutar su IA
    if (nextUserId === "bot-juan") {
        botPlay(room);
    }
}

function botPlay(room: Room) {
    // El bot espera 2.5 segundos y tira
    setTimeout(() => {
        if (rooms[room.id] && room.turnUserId === "bot-juan") {
            const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
            room.rolls["bot-juan"] = roll;
            io.to(room.id).emit('dice_rolled', { userId: "bot-juan", roll });
            checkTurn(room);
        }
    }, 2500);
}

// Limpiar datos internos antes de enviar al cliente
function sanitize(room: Room) {
    const { botTimeout, ...rest } = room;
    return rest;
}

httpServer.listen(4000, () => {
    console.log('🚀 Game Server SIMPLE running on 4000');
});
