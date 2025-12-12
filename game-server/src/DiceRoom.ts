import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuración de reglas
const PERCENTAGE_PER_ROUND = 0.20; // 20% de la apuesta total
const TURN_TIMEOUT_MS = 30000;     // 30 Segundos para tirar

interface Player {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl: string;
    position: 1 | 2;
    balance: number;
    skin: string;
    isBot: boolean;
    connected: boolean;
}

interface RoundHistory {
    round: number;
    rolls: { [userId: string]: [number, number] };
    winnerId: string | null;
    starterId: string | null;
}

export class DiceRoom {
    public id: string;
    public priceCents: number;
    public stepValue: number;
    public botWaitMs: number;
    public autoLockAt: Date | null;

    public players: Player[] = [];
    public status: 'WAITING' | 'PLAYING' | 'ROUND_END' | 'FINISHED' = 'WAITING';

    public round: number = 1;
    public turnUserId: string | null = null;
    public roundStarterId: string | null = null; // Rastrea quién inició la ronda actual

    public rolls: { [userId: string]: [number, number] } = {};
    public history: RoundHistory[] = [];

    private io: Server;
    private timer: NodeJS.Timeout | null = null;
    private botTimer: NodeJS.Timeout | null = null;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.io = io;
    }

    public addPlayer(socket: Socket, user: any, isBot: boolean = false) {
        // 1. Manejo de reconexión
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        // 2. Validar cupo
        if (this.players.length >= 2 || (this.status !== 'WAITING' && !isBot)) return;

        // 3. Añadir jugador
        this.players.push({
            socketId: isBot ? 'bot' : socket.id,
            userId: user.id,
            username: user.name || "Jugador",
            avatarUrl: user.avatar || "",
            position: this.players.some(p => p.position === 1) ? 2 : 1,
            balance: this.priceCents,
            skin: user.selectedDiceColor || 'white',
            isBot,
            connected: true
        });

        // Asegurar orden: Posición 1 primero, Posición 2 después
        this.players.sort((a, b) => a.position - b.position);
        this.broadcastState();

        // Lógica de inicio
        if (this.players.length === 1) this.scheduleBot();
        else if (this.players.length === 2) {
            this.cancelBot();
            setTimeout(() => this.startGame(), 2000);
        }
    }

    // Método para enviar estado a espectadores sin añadirlos
    public emitStateToSocket(socket: Socket) {
        socket.emit('update_game', this.buildStatePayload());
    }

    public removePlayer(socketId: string) {
        const p = this.players.find(p => p.socketId === socketId);
        if (!p) return;
        if (this.status === 'WAITING') {
            this.players = this.players.filter(pl => pl.socketId !== socketId);
            this.scheduleBot();
        } else {
            p.connected = false;
        }
        this.broadcastState();
    }

    private startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.history = [];
        this.rolls = {};

        // REGLA: El primer tiro es para el que entró primero (Posición 1)
        const firstPlayer = this.players.find(p => p.position === 1);
        this.turnUserId = firstPlayer ? firstPlayer.userId : this.players[0].userId;
        this.roundStarterId = this.turnUserId;

        this.broadcastState();
        this.processTurn();
    }

    public handleRoll(userId: string) {
        // Validaciones de seguridad
        if (this.status !== 'PLAYING') return;
        if (this.turnUserId !== userId) return; // No es su turno
        if (this.rolls[userId]) return; // Ya tiró

        // Generar dados
        const roll: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        this.rolls[userId] = roll;

        // Detener timer de derrota por tiempo
        if (this.timer) clearTimeout(this.timer);

        // Notificar animación
        this.io.to(this.id).emit('dice_anim', { userId, result: roll });

        // Esperar animación y pasar turno o resolver
        setTimeout(() => {
            const opponent = this.players.find(p => p.userId !== userId);

            if (opponent && !this.rolls[opponent.userId]) {
                // Si falta el rival, le toca a él
                this.turnUserId = opponent.userId;
                this.broadcastState();
                this.processTurn();
            } else {
                // Ambos tiraron, resolver ronda
                this.resolveRound();
            }
        }, 1500);
    }

    private resolveRound() {
        this.status = 'ROUND_END';
        this.turnUserId = null;
        if (this.timer) clearTimeout(this.timer);

        const [p1, p2] = this.players;
        const s1 = this.rolls[p1.userId].reduce((a, b) => a + b, 0);
        const s2 = this.rolls[p2.userId].reduce((a, b) => a + b, 0);

        // Determinar ganador
        let winnerId: string | null = null;
        if (s1 > s2) {
            winnerId = p1.userId;
            p1.balance += this.stepValue;
            p2.balance -= this.stepValue;
        } else if (s2 > s1) {
            winnerId = p2.userId;
            p2.balance += this.stepValue;
            p1.balance -= this.stepValue;
        }

        // Ajustar saldos visuales a 0 si bajan
        if (p1.balance < 0) p1.balance = 0;
        if (p2.balance < 0) p2.balance = 0;

        // Guardar historial
        this.history.push({
            round: this.round,
            rolls: JSON.parse(JSON.stringify(this.rolls)),
            winnerId,
            starterId: this.roundStarterId
        });

        this.broadcastState();
        this.io.to(this.id).emit('round_result', { winnerId, rolls: this.rolls });

        // Verificar si alguien perdió todo (Saldo 0)
        const loser = this.players.find(p => p.balance <= 0);

        if (loser) {
            const winner = this.players.find(p => p.userId !== loser.userId)!;
            setTimeout(() => this.finishGame(winner, "SCORE"), 5000);
        } else {
            // Siguiente ronda: Pasamos quién ganó para que empiece él
            setTimeout(() => this.nextRound(winnerId), 5000);
        }
    }

    private nextRound(lastWinnerId: string | null) {
        this.round++;
        this.rolls = {};
        this.status = 'PLAYING';

        // REGLA: El ganador de la ronda anterior tira primero.
        if (lastWinnerId) {
            this.turnUserId = lastWinnerId;
        } else {
            // Si fue empate, alternamos el turno respecto a quien empezó la ronda anterior
            const currentStarter = this.roundStarterId;
            const nextStarter = this.players.find(p => p.userId !== currentStarter);
            this.turnUserId = nextStarter ? nextStarter.userId : this.players[0].userId;
        }

        // Guardamos quién empieza esta nueva ronda
        this.roundStarterId = this.turnUserId;

        this.broadcastState();
        this.processTurn();
    }

    private async finishGame(winner: Player, reason: string = "SCORE") {
        this.status = 'FINISHED';
        this.turnUserId = null;
        if (this.timer) clearTimeout(this.timer);

        const total = this.players.reduce((a, b) => a + this.priceCents, 0);

        this.io.to(this.id).emit('game_over', {
            winnerId: winner.userId,
            prize: total,
            reason: reason
        });

        try {
            // Registrar resultado en DB
            await prisma.gameResult.create({
                data: { roomId: this.id, winnerUserId: winner.userId, winnerName: winner.username, prizeCents: total, roundNumber: this.round }
            });
            await prisma.user.update({ where: { id: winner.userId }, data: { balanceCents: { increment: total } } });
            await prisma.room.update({ where: { id: this.id }, data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId } });
        } catch (e) { }
    }

    private processTurn() {
        if (this.timer) clearTimeout(this.timer);

        const p = this.players.find(pl => pl.userId === this.turnUserId);
        if (!p) return;

        if (p.isBot) {
            // Turno del BOT
            const botDelay = Math.random() * 2000 + 1000;
            this.timer = setTimeout(() => this.handleRoll(p.userId), botDelay);
        } else {
            // Turno del HUMANO: Temporizador de 30 segundos
            this.timer = setTimeout(() => {
                // Si se acaba el tiempo, el otro jugador gana AUTOMÁTICAMENTE
                const winner = this.players.find(pl => pl.userId !== p.userId);
                if (winner) {
                    this.io.to(this.id).emit('error_msg', { message: `¡${p.username} perdió por tiempo!` });
                    this.finishGame(winner, "TIMEOUT");
                }
            }, TURN_TIMEOUT_MS);
        }
    }

    private scheduleBot() {
        if (this.botTimer) clearTimeout(this.botTimer);
        if (this.botWaitMs > 0) this.botTimer = setTimeout(() => this.injectBot(), this.botWaitMs);
    }

    private cancelBot() { if (this.botTimer) clearTimeout(this.botTimer); }

    private async injectBot() {
        const bot = await prisma.user.findFirst({ where: { isBot: true } });
        if (bot) this.addPlayer({ id: 'bot' } as any, { id: bot.id, name: bot.name, avatar: bot.avatarUrl, selectedDiceColor: 'red' }, true);
    }

    private buildStatePayload() {
        return {
            status: this.status,
            round: this.round,
            turnUserId: this.turnUserId,
            rolls: this.rolls,
            history: this.history,
            players: this.players.map(p => ({
                userId: p.userId, name: p.username, avatar: p.avatarUrl,
                balance: p.balance, position: p.position, isBot: p.isBot, skin: p.skin
            })),
            // Calculamos tiempo restante aproximado para el cliente (útil si recarga)
            timeLeft: this.status === 'PLAYING' ? 30 : 0
        };
    }

    private broadcastState() {
        this.io.to(this.id).emit('update_game', this.buildStatePayload());
    }
}
