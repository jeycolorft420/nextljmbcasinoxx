import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PERCENTAGE_PER_ROUND = 0.20;
const TURN_TIMEOUT = 12000;

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
        // 1. Reconexión
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        // 2. Validación de cupo
        if (this.players.length >= 2 || (this.status !== 'WAITING' && !isBot)) return;

        // 3. Nuevo Jugador
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
            setTimeout(() => this.startGame(), 1000);
        }
    }

    // Método para espectadores (NO añade jugador, solo envía datos)
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
        this.turnUserId = this.players[0]?.userId || null;
        this.broadcastState();
        this.processTurn();
    }

    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING' || this.turnUserId !== userId || this.rolls[userId]) return;

        const roll: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        this.rolls[userId] = roll;

        this.io.to(this.id).emit('dice_anim', { userId, result: roll });

        if (this.timer) clearTimeout(this.timer);

        setTimeout(() => {
            const opponent = this.players.find(p => p.userId !== userId);
            if (opponent && !this.rolls[opponent.userId]) {
                this.turnUserId = opponent.userId;
                this.broadcastState();
                this.processTurn();
            } else {
                this.resolveRound();
            }
        }, 1500);
    }

    private resolveRound() {
        this.status = 'ROUND_END';
        this.turnUserId = null;

        const [p1, p2] = this.players;
        const s1 = this.rolls[p1.userId].reduce((a, b) => a + b, 0);
        const s2 = this.rolls[p2.userId].reduce((a, b) => a + b, 0);

        let winnerId: string | null = null;
        if (s1 > s2) { winnerId = p1.userId; p1.balance += this.stepValue; p2.balance -= this.stepValue; }
        else if (s2 > s1) { winnerId = p2.userId; p2.balance += this.stepValue; p1.balance -= this.stepValue; }

        if (p1.balance < 0) p1.balance = 0;
        if (p2.balance < 0) p2.balance = 0;

        this.history.push({ round: this.round, rolls: { ...this.rolls }, winnerId });

        this.broadcastState();
        this.io.to(this.id).emit('round_result', { winnerId, rolls: this.rolls });

        const loser = this.players.find(p => p.balance <= 0);
        if (loser) setTimeout(() => this.finishGame(this.players.find(p => p.userId !== loser.userId)!), 5000);
        else setTimeout(() => this.nextRound(), 5000);
    }

    private nextRound() {
        this.round++;
        this.rolls = {};
        this.status = 'PLAYING';
        this.turnUserId = this.players[0].userId;
        this.broadcastState();
        this.processTurn();
    }

    private async finishGame(winner: Player) {
        this.status = 'FINISHED';
        const total = this.players.reduce((a, b) => a + this.priceCents, 0);
        this.io.to(this.id).emit('game_over', { winnerId: winner.userId, prize: total });

        try {
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

        const delay = p.isBot ? Math.random() * 1000 + 1000 : TURN_TIMEOUT;
        this.timer = setTimeout(() => this.handleRoll(p.userId), delay);
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
            }))
        };
    }

    private broadcastState() {
        this.io.to(this.id).emit('update_game', this.buildStatePayload());
    }
}
