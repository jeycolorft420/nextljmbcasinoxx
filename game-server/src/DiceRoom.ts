import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- CONFIGURACIÓN DEL JUEGO ---
const PERCENTAGE_PER_ROUND = 0.20;
const TURN_TIMEOUT_MS = 30000;      // 30 Segundos para tirar
const ROUND_TRANSITION_MS = 6000;   // 6 Segundos para celebrar

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
    isTimeout?: boolean; // Nuevo: Para saber si fue por tiempo
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
    public roundStarterId: string | null = null;

    public rolls: { [userId: string]: [number, number] } = {};
    public history: RoundHistory[] = [];

    private io: Server;
    private timer: NodeJS.Timeout | null = null;
    private botTimer: NodeJS.Timeout | null = null;
    private turnExpiresAt: number = 0;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.io = io;
    }

    public addPlayer(socket: Socket, user: any, isBot: boolean = false) {
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        if (this.players.length >= 2 || (this.status !== 'WAITING' && !isBot)) return;

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

        this.players.sort((a, b) => a.position - b.position);
        this.broadcastState();

        if (this.players.length === 1) this.scheduleBot();
        else if (this.players.length === 2) {
            this.cancelBot();
            setTimeout(() => this.startGame(), 2000);
        }
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

    public emitStateToSocket(socket: Socket) {
        socket.emit('update_game', this.buildStatePayload());
    }

    private startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.history = [];
        this.rolls = {};

        // P1 (Creador) siempre empieza
        const firstPlayer = this.players.find(p => p.position === 1);
        this.roundStarterId = firstPlayer?.userId || this.players[0].userId;
        this.turnUserId = this.roundStarterId;

        // CAMBIO CRÍTICO: Primero procesamos el turno (reset timer + set expiración)
        this.processTurn();
        // LUEGO enviamos el estado con el tiempo correcto
        this.broadcastState();
    }

    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING') return;
        if (this.turnUserId !== userId) return;
        if (this.rolls[userId]) return;

        const roll: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        this.rolls[userId] = roll;

        if (this.timer) clearTimeout(this.timer);

        this.io.to(this.id).emit('dice_anim', { userId, result: roll });

        setTimeout(() => {
            const opponent = this.players.find(p => p.userId !== userId);

            if (opponent && !this.rolls[opponent.userId]) {
                this.turnUserId = opponent.userId;
                // CAMBIO: Asegurar orden correcto también aquí si fuera necesario, 
                // pero handleRoll -> processTurn es directo.
                // Sin embargo, processTurn se encarga de definir el tiempo.
                // El orden aquí estaba: broadcast -> processTurn.
                // CORRECCIÓN: Primero processTurn, luego broadcast.
                this.processTurn();
                this.broadcastState();
            } else {
                this.resolveRound();
            }
        }, 1500);
    }

    // Lógica cuando se acaba el tiempo de un jugador
    private handleTurnTimeout(userId: string) {
        if (this.status !== 'PLAYING') return;

        const loser = this.players.find(p => p.userId === userId);
        const winner = this.players.find(p => p.userId !== userId);

        if (!loser || !winner) return;

        // Forzamos dados [0,0] para el perdedor para indicar que no tiró
        this.rolls[userId] = [0, 0];

        // Mensaje global
        this.io.to(this.id).emit('error_msg', { message: `⌛ ¡${loser.username} no tiró a tiempo!` });

        // Resolver ronda forzando ganador
        this.finalizeRoundLogic(winner.userId, true);
    }

    private resolveRound() {
        if (this.timer) clearTimeout(this.timer);
        const [p1, p2] = this.players;

        const s1 = (this.rolls[p1.userId] || [0, 0]).reduce((a, b) => a + b, 0);
        const s2 = (this.rolls[p2.userId] || [0, 0]).reduce((a, b) => a + b, 0);

        let winnerId: string | null = null;
        if (s1 > s2) winnerId = p1.userId;
        else if (s2 > s1) winnerId = p2.userId;

        this.finalizeRoundLogic(winnerId, false);
    }

    private finalizeRoundLogic(winnerId: string | null, isTimeout: boolean) {
        this.status = 'ROUND_END';
        this.turnUserId = null;
        if (this.timer) clearTimeout(this.timer);

        // Actualizar saldos
        if (winnerId) {
            const winner = this.players.find(p => p.userId === winnerId);
            const loser = this.players.find(p => p.userId !== winnerId);
            if (winner && loser) {
                winner.balance += this.stepValue;
                loser.balance -= this.stepValue;
            }
        }

        // Evitar negativos
        this.players.forEach(p => { if (p.balance < 0) p.balance = 0; });

        // Guardar historial
        this.history.push({
            round: this.round,
            rolls: JSON.parse(JSON.stringify(this.rolls)),
            winnerId,
            starterId: this.roundStarterId,
            isTimeout
        });

        this.broadcastState();

        // Datos para la pantalla de victoria de ronda
        this.io.to(this.id).emit('round_result', {
            winnerId,
            rolls: this.rolls,
            isTimeout
        });

        // Verificar muerte súbita (Bancarrota)
        const bankruptPlayer = this.players.find(p => p.balance <= 0);

        if (bankruptPlayer) {
            const gameWinner = this.players.find(p => p.userId !== bankruptPlayer.userId)!;
            setTimeout(() => this.finishGame(gameWinner, "SCORE"), ROUND_TRANSITION_MS);
        } else {
            // Si nadie murió, seguimos jugando
            setTimeout(() => this.nextRound(winnerId), ROUND_TRANSITION_MS);
        }
    }

    private nextRound(lastWinnerId: string | null) {
        this.round++;
        this.rolls = {};
        this.status = 'PLAYING';

        // Ganador tira primero, si empate alterna
        if (lastWinnerId) {
            this.turnUserId = lastWinnerId;
        } else {
            const currentStarter = this.roundStarterId;
            const nextStarter = this.players.find(p => p.userId !== currentStarter);
            this.turnUserId = nextStarter ? nextStarter.userId : this.players[0].userId;
        }

        this.roundStarterId = this.turnUserId;

        // CAMBIO CRÍTICO: Primero procesamos el turno, luego enviamos estado.
        this.processTurn();
        this.broadcastState();
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

        // Asegurar actualización final
        this.broadcastState();

        try {
            await prisma.gameResult.create({
                data: { roomId: this.id, winnerUserId: winner.userId, winnerName: winner.username, prizeCents: total, roundNumber: this.round }
            });
            await prisma.user.update({ where: { id: winner.userId }, data: { balanceCents: { increment: total } } });
            await prisma.room.update({ where: { id: this.id }, data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId } });
        } catch (e) { }

        console.log("[DiceRoom " + this.id + "] Partida finalizada. Reiniciando sala en 10s...");

        // IMPORTANTE: Guardar referencia al timeout para poder cancelarlo si es necesario
        if (this.timer) clearTimeout(this.timer);

        this.timer = setTimeout(() => {
            this.reset();
        }, 10000); // 10 segundos de espera para ver el resultado
    }

    private processTurn() {
        if (this.timer) clearTimeout(this.timer);

        const p = this.players.find(pl => pl.userId === this.turnUserId);
        if (!p) return;

        // DEFINIR EL TIEMPO INMEDIATAMENTE (30s)
        // Esto asegura que broadcastState siempre tenga el valor futuro correcto
        this.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;

        if (p.isBot) {
            const botDelay = Math.random() * 2000 + 1000;
            this.timer = setTimeout(() => this.handleRoll(p.userId), botDelay);
        } else {
            this.timer = setTimeout(() => {
                this.handleTurnTimeout(p.userId);
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
            stepValue: this.stepValue,
            timeLeft: this.status === 'PLAYING' ? Math.max(0, Math.ceil((this.turnExpiresAt - Date.now()) / 1000)) : 0
        };
    }

    private broadcastState() {
        this.io.to(this.id).emit('update_game', this.buildStatePayload());
    }

    public reset() {
        console.log(`[DiceRoom ${this.id}] EJECUTANDO RESET NUCLEAR.`);

        // 1. Matar timers
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }

        // 2. VACIAR MEMORIA (Lo más importante)
        this.players = []; // Array vacío = Nadie sentado
        this.rolls = {};
        this.history = [];
        this.round = 1;
        this.turnUserId = null;
        this.roundStarterId = null;
        this.status = 'WAITING';
        // this.winner = null; // (Note: Property winner does not exist on class, skipping to avoid error)

        // 3. Forzar actualización de estado INMEDIATA
        // Enviamos el estado limpio para que el frontend redibuje una mesa vacía
        this.broadcastState();

        // 4. Emitir señal específica de reset
        this.io.to(this.id).emit('server:room:reset');

        // 5. Reiniciar bucle de bots (si aplica)
        this.scheduleBot();
    }
}
