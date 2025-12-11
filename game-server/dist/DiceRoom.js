"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiceRoom = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Configuración
const PERCENTAGE_PER_ROUND = 0.20; // 20% de la apuesta base
const TURN_TIMEOUT_SECONDS = 15; // Tiempo para tirar antes de que tire auto
class DiceRoom {
    constructor(roomId, priceCents, io) {
        this.players = [];
        this.status = 'WAITING';
        // Estado de la ronda actual
        this.round = 1;
        this.turnUserId = null;
        this.rolls = {}; // Guardar tiros de la ronda { "user1": 5, "user2": 3 }
        this.timer = null;
        this.id = roomId;
        this.priceCents = priceCents;
        // Calculamos el 20% de la apuesta base
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.io = io;
    }
    /**
     * Un usuario intenta entrar a la sala
     */
    addPlayer(socket, user, isBot = false) {
        // Si ya está, actualizamos socket
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            existing.socketId = socket.connected ? socket.id : "bot";
            existing.connected = true;
            this.broadcastState();
            return;
        }
        if (this.players.length >= 2)
            return; // Sala llena
        // Asignar posición: 1 si es el primero, 2 si es el segundo
        const position = this.players.some(p => p.position === 1) ? 2 : 1;
        const newPlayer = {
            socketId: socket.id,
            userId: user.id,
            username: user.name,
            avatarUrl: user.avatar,
            position,
            currentBalance: this.priceCents, // Empiezan con su apuesta completa (ej: $5)
            skin: user.skin || 'default',
            isBot,
            connected: true
        };
        this.players.push(newPlayer);
        // Ordenar array para que pos 1 esté siempre en índice 0 (opcional pero útil)
        this.players.sort((a, b) => a.position - b.position);
        this.broadcastState();
        this.checkStart();
    }
    /**
     * Verificar si podemos iniciar el PvP
     */
    checkStart() {
        if (this.status === 'WAITING' && this.players.length === 2) {
            console.log(`[Sala ${this.id}] Iniciando juego PvP...`);
            this.startGame();
        }
    }
    startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.rolls = {};
        // Regla: "El primer tiro lo tiene el que primero entró" (Posición 1)
        const p1 = this.players.find(p => p.position === 1);
        this.turnUserId = p1 ? p1.userId : this.players[0].userId;
        this.broadcastState();
        // Iniciar temporizador de turno (para evitar AFK)
        this.startTurnTimer();
    }
    /**
     * Manejar tiro de dados
     */
    handleRoll(userId) {
        if (this.status !== 'PLAYING')
            return;
        if (this.turnUserId !== userId)
            return; // No es su turno
        if (this.rolls[userId])
            return; // Ya tiró en esta ronda
        // 1. Generar número aleatorio (1-6)
        // TODO: Aquí integrarías tu lógica "Provably Fair" si la tienes
        const val = Math.floor(Math.random() * 6) + 1;
        this.rolls[userId] = val;
        // Emitir el tiro inmeadiatamente para animación
        this.io.to(this.id).emit('dice_rolled', { userId, value: val });
        // 2. Pasar turno o Evaluar Ronda
        const opponent = this.players.find(p => p.userId !== userId);
        if (opponent && !this.rolls[opponent.userId]) {
            // El oponente falta por tirar
            this.turnUserId = opponent.userId;
            this.broadcastState();
            this.startTurnTimer();
        }
        else {
            // Ambos han tirado, resolver ronda
            this.resolveRound();
        }
    }
    /**
     * Resolver quién ganó la ronda y mover el dinero
     */
    resolveRound() {
        this.turnUserId = null; // Pausa momentánea
        if (this.timer)
            clearTimeout(this.timer);
        const p1 = this.players[0];
        const p2 = this.players[1];
        const val1 = this.rolls[p1.userId];
        const val2 = this.rolls[p2.userId];
        let roundWinnerId = null;
        // Lógica de Ganador de Ronda
        if (val1 > val2) {
            roundWinnerId = p1.userId;
            // P1 roba a P2
            p1.currentBalance += this.stepValue;
            p2.currentBalance -= this.stepValue;
        }
        else if (val2 > val1) {
            roundWinnerId = p2.userId;
            // P2 roba a P1
            p2.currentBalance += this.stepValue;
            p1.currentBalance -= this.stepValue;
        }
        else {
            // Empate: Nadie pierde saldo
            roundWinnerId = "TIE";
        }
        // Emitir resultado de la ronda
        this.io.to(this.id).emit('round_result', {
            rolls: this.rolls,
            winnerId: roundWinnerId,
            players: this.players.map(p => ({ userId: p.userId, balance: p.currentBalance }))
        });
        // Verificar si alguien llegó a 0 (GAME OVER)
        const bankruptPlayer = this.players.find(p => p.currentBalance <= 0);
        if (bankruptPlayer) {
            const winner = this.players.find(p => p.userId !== bankruptPlayer.userId);
            this.finishGame(winner);
        }
        else {
            // Siguiente Ronda en 3 segundos
            setTimeout(() => {
                this.nextRound();
            }, 3000);
        }
    }
    nextRound() {
        this.round++;
        this.rolls = {};
        // Regla: "rondas tiene un tiro para cada jugador"
        // Por tu descripción: "el primer tiro lo tiene el que primer entró", asumiremos fijo P1 o ganador.
        // Vamos a dejar fijo a P1 inicia siempre la ronda por ahora para cumplir la regla básica.
        this.turnUserId = this.players.find(p => p.position === 1)?.userId || null;
        this.broadcastState();
        this.startTurnTimer();
    }
    async finishGame(winner) {
        this.status = 'FINISHED';
        const loser = this.players.find(p => p.userId !== winner.userId);
        const prizeTotal = this.players.reduce((sum, p) => sum + this.priceCents, 0); // Total del pozo original
        // Emitir fin
        this.io.to(this.id).emit('game_over', {
            winnerId: winner.userId,
            prize: prizeTotal
        });
        // --- PERSISTENCIA EN DB (PRISMA) ---
        // Aquí guardamos el historial y movemos el dinero REAL en la base de datos
        try {
            // 1. Crear registro de resultado
            // NOTE: Ajuste el esquema de Prisma si es necesario
            /*
            await prisma.gameResult.create({
                data: {
                    roomId: this.id,
                    winnerUserId: winner.userId,
                    winnerName: winner.username,
                    prizeCents: prizeTotal,
                    roundNumber: this.round,
                }
            });
            */
            // 2. Actualizar Saldos de Billetera (User)
            // IMPORTANTE: Asumimos que el saldo YA se descontó al crear la Entry.
            await prisma.user.update({
                where: { id: winner.userId },
                data: {
                    balanceCents: { increment: prizeTotal },
                }
            });
            // 3. Marcar sala como terminada
            await prisma.room.update({
                where: { id: this.id },
                data: {
                    state: 'FINISHED',
                    finishedAt: new Date(),
                    //winningEntryId: winner.userId 
                }
            });
            console.log(`[Sala ${this.id}] Juego terminado. Ganador: ${winner.username}`);
        }
        catch (error) {
            console.error("Error guardando partida en DB:", error);
        }
    }
    /**
     * Timer para que si un jugador no tira, tire automático (o pierda turno)
     */
    startTurnTimer() {
        if (this.timer)
            clearTimeout(this.timer);
        // Si el turno es de un BOT, tirar automáticamente rápido
        const currentPlayer = this.players.find(p => p.userId === this.turnUserId);
        if (currentPlayer && currentPlayer.isBot) {
            const delay = Math.floor(Math.random() * 2000) + 1500; // 1.5s - 3.5s
            this.timer = setTimeout(() => {
                this.handleRoll(currentPlayer.userId);
            }, delay);
            return;
        }
        // Si es HUMANO, darle 15 segs
        this.timer = setTimeout(() => {
            if (this.status === 'PLAYING' && this.turnUserId) {
                // Auto-roll random por demora
                console.log(`Auto-rolling for ${this.turnUserId} due to timeout`);
                this.handleRoll(this.turnUserId);
            }
        }, TURN_TIMEOUT_SECONDS * 1000);
    }
    /**
     * Enviar estado completo a todos en la sala
     */
    broadcastState() {
        this.io.to(this.id).emit('update_game', {
            status: this.status,
            players: this.players.map(p => ({
                userId: p.userId,
                name: p.username,
                balance: p.currentBalance,
                avatar: p.avatarUrl,
                skin: p.skin,
                position: p.position
            })),
            turnUserId: this.turnUserId,
            round: this.round,
            rolls: this.rolls,
            pot: this.players.reduce((sum, p) => sum + p.currentBalance, 0) // Debe ser constante
        });
    }
    /**
     * Usuario se desconecta
     */
    removePlayer(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (player) {
            player.connected = false;
            this.io.to(this.id).emit('player_disconnected', { userId: player.userId });
        }
    }
}
exports.DiceRoom = DiceRoom;
