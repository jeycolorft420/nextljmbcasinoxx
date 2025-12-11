import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 10000,
    pingInterval: 5000
});

// Tipos
type Player = {
    socketId: string;
    userId: string;
    name: string;
    isBot: boolean;
    skin: string;
};

interface GameState {
    roomId: string;
    players: Player[]; // Array ordenado: [0] es P1, [1] es P2
    rolls: { [userId: string]: number[] };
    turnUserId: string | null; // ID del usuario que tiene el turno
    timer: number;
    winner: string | null;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    round: number;
}

const rooms: { [roomId: string]: GameState } = {};

// Mapa inverso para saber en qué sala está un socket (para desconexión rápida)
const socketRoomMap: { [socketId: string]: string } = {};

io.on('connection', (socket) => {
    console.log(`🔌 Conexión: ${socket.id}`);

    // 1. UNIRSE A SALA
    socket.on('join_room', ({ roomId, user }) => {
        // Limpieza previa si el socket ya estaba en otra sala
        leaveRoom(socket.id);

        socket.join(roomId);
        socketRoomMap[socket.id] = roomId;

        // Inicializar sala si no existe
        if (!rooms[roomId]) {
            rooms[roomId] = {
                roomId,
                players: [],
                rolls: {},
                turnUserId: null,
                timer: 30,
                winner: null,
                status: 'WAITING',
                round: 1
            };
        }

        const room = rooms[roomId];

        // Evitar duplicados (si el usuario reconecta)
        const existingIdx = room.players.findIndex(p => p.userId === user.id);
        if (existingIdx !== -1) {
            room.players[existingIdx].socketId = socket.id; // Actualizar socket
        } else {
            // Añadir jugador solo si hay espacio (< 2)
            if (room.players.length < 2) {
                room.players.push({
                    socketId: socket.id,
                    userId: user.id,
                    name: user?.name || "Jugador",
                    isBot: false,
                    skin: "white"
                });
            }
        }

        // Lógica de Inicio de Juego
        checkGameStart(roomId);

        // Emitir estado actual
        io.to(roomId).emit('update_game', room);
    });

    // 2. TIRAR DADOS
    socket.on('roll_dice', ({ roomId, userId }) => {
        const room = rooms[roomId];
        if (!room) return;

        // VALIDACIÓN ESTRICTA DE TURNO 🛡️
        // Si no es tu turno, o ya tiraste, ignorar.
        if (room.turnUserId !== userId) {
            console.log(`🚫 Intento de tiro ilegal: ${userId} (Turno de: ${room.turnUserId})`);
            return;
        }

        // Generar dados
        const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        room.rolls[userId] = roll;

        // Notificar tiro
        io.to(roomId).emit('dice_rolled', { userId, roll });

        // PASAR TURNO O TERMINAR
        const otherPlayer = room.players.find(p => p.userId !== userId);

        // Si el otro ya tiró, calculamos ganador
        if (otherPlayer && room.rolls[otherPlayer.userId]) {
            room.turnUserId = null; // Nadie tira mientras se calcula
            io.to(roomId).emit('update_game', room);

            setTimeout(() => calculateWinner(roomId), 1000); // Pequeña pausa dramática
        } else if (otherPlayer) {
            // Pasar turno al otro
            room.turnUserId = otherPlayer.userId;
            io.to(roomId).emit('update_game', room);

            // Si el siguiente es BOT, activar su IA
            if (otherPlayer.isBot) {
                triggerBotTurn(roomId, otherPlayer.userId);
            }
        }
    });

    // 3. DESCONEXIÓN
    socket.on('disconnect', () => {
        leaveRoom(socket.id);
    });
});

// --- LÓGICA DE JUEGO ---

function leaveRoom(socketId: string) {
    const roomId = socketRoomMap[socketId];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    // Quitar jugador de la lista
    room.players = room.players.filter(p => p.socketId !== socketId);
    delete socketRoomMap[socketId];

    // Si la sala queda vacía, borrarla
    if (room.players.length === 0) {
        delete rooms[roomId];
    } else {
        // Si queda alguien, notificar
        // Si se fue un humano en medio del juego, resetear a WAITING
        if (room.status === 'PLAYING') {
            room.status = 'WAITING';
            room.rolls = {};
            room.winner = null;
        }
        io.to(roomId).emit('update_game', room);

        // Si quedó un bot solo, borrarlo también (para que no se quede zombie)
        const remaining = room.players[0];
        if (remaining.isBot) {
            room.players = [];
            delete rooms[roomId];
        }
    }
}

function checkGameStart(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;

    // A. Si hay 2 jugadores, ¡EMPEZAR!
    if (room.players.length === 2) {
        if (room.status !== 'PLAYING') {
            room.status = 'PLAYING';
            room.turnUserId = room.players[0].userId; // Empieza el P1
            room.rolls = {};
            room.winner = null;

            console.log(`🎲 Juego iniciado en ${roomId}. Turno de ${room.turnUserId}`);
            io.to(roomId).emit('update_game', room);

            // Si P1 es bot (raro pero posible), activar
            if (room.players[0].isBot) {
                triggerBotTurn(roomId, room.players[0].userId);
            }
        }
    }
    // B. Si hay 1 jugador SOLO, programar BOT
    else if (room.players.length === 1 && !room.players[0].isBot) {
        // Limpiar timeouts anteriores si los hubiera
        // (Simplificado: solo lanzamos si no hay bot ya)
        setTimeout(() => {
            const r = rooms[roomId];
            // Verificar que sigue solo 1 jugador y es humano
            if (r && r.players.length === 1 && !r.players[0].isBot) {
                const botId = "bot-juan";
                r.players.push({
                    socketId: "bot-socket",
                    userId: botId,
                    name: "Juan Bot 🤖",
                    isBot: true,
                    skin: "red"
                });
                io.to(roomId).emit('player_joined', { name: "Juan Bot 🤖" });
                checkGameStart(roomId); // Recursivo para iniciar
            }
        }, 3000);
    }
}

function triggerBotTurn(roomId: string, botId: string) {
    // Simular "pensar" entre 2 y 4 segundos
    const delay = Math.floor(Math.random() * 2000) + 2000;

    setTimeout(() => {
        const room = rooms[roomId];
        if (!room || room.turnUserId !== botId) return;

        // El bot "emite" su evento internamente
        // (Reusamos la lógica de roll_dice pero llamada directamente)
        const roll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        room.rolls[botId] = roll;
        io.to(roomId).emit('dice_rolled', { userId: botId, roll });

        // Verificar si termina
        const human = room.players.find(p => !p.isBot);
        if (human && room.rolls[human.userId]) {
            calculateWinner(roomId);
        } else {
            // Si el humano no ha tirado, pasarle el turno
            if (human) room.turnUserId = human.userId;
            io.to(roomId).emit('update_game', room);
        }
    }, delay);
}

function calculateWinner(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;

    let bestSum = -1;
    let winnerId = "TIE";

    room.players.forEach(p => {
        const r = room.rolls[p.userId];
        if (r) {
            const sum = r[0] + r[1];
            if (sum > bestSum) {
                bestSum = sum;
                winnerId = p.userId;
            } else if (sum === bestSum) {
                winnerId = "TIE";
            }
        }
    });

    room.winner = winnerId;
    room.status = 'FINISHED';
    io.to(roomId).emit('update_game', room);
    io.to(roomId).emit('game_over', { winnerId });

    // REINICIAR RODA (5 segundos)
    setTimeout(() => {
        if (rooms[roomId]) {
            rooms[roomId].round++;
            rooms[roomId].rolls = {};
            rooms[roomId].winner = null;
            rooms[roomId].status = 'PLAYING';
            // Alternar turno: En ronda par empieza P2, impar P1
            const starterIdx = (rooms[roomId].round % 2 === 0) ? 1 : 0;
            rooms[roomId].turnUserId = rooms[roomId].players[starterIdx].userId;

            io.to(roomId).emit('update_game', rooms[roomId]);

            // Si le toca al bot, activar
            if (rooms[roomId].players[starterIdx].isBot) {
                triggerBotTurn(roomId, rooms[roomId].turnUserId);
            }
        }
    }, 5000);
}

httpServer.listen(4000, () => {
    console.log('🚀 Game Engine Active on 4000');
});
