// game-server/src/DiceRoom.ts
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PERCENTAGE_PER_ROUND = 0.20;
const ROUND_TIMEOUT_SECONDS = 15; // Tiempo máximo para dar "Ready"

interface PlayerState {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl?: string;
    position: 1 | 2;
    currentBalance: number;
    skin: string;
    isBot: boolean;
    connected: boolean;
}

// Estructura de dados legacy: { p1: [1, 6], p2: [3, 2] }
interface RoundDice {
    p1: [number, number];
    p2: [number, number];
}

export class DiceRoom {
    public id: string;
    public priceCents: number;
    public stepValue: number;

    // Tiempos
    public botWaitMs: number;
    public autoLockAt: Date | null;

    public players: PlayerState[] = [];
    public status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CLOSED' = 'WAITING';

    public round: number = 1;

    // Legacy Logic: No "Active Turn", but "Both Ready"
    public roundReady = new Set<string>(); // IDs de usuarios que dieron "Roll"

    public lastDice: RoundDice | null = null;

    private io: Server;
    private actionTimer: NodeJS.Timeout | null = null;
    private botInjectionTimer: NodeJS.Timeout | null = null;
    private autoLockTimer: NodeJS.Timeout | null = null;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.io = io;

        this.scheduleAutoLock();
    }

    /**
     * MÉTODOS DE GESTIÓN DE SALA (JOIN/LEAVE)
     */
    public addPlayer(socket: Socket, user: { id: string, name: string, skin: string, avatar?: string }, isBot: boolean = false) {
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        if (this.players.length >= 2 || this.status !== 'WAITING') {
            if (!isBot) socket.emit('error', { message: 'Sala llena o en juego' });
            return;
        }

        const takenPositions = this.players.map(p => p.position);
        const position = takenPositions.includes(1) ? 2 : 1;

        const newPlayer: PlayerState = {
            socketId: isBot ? `bot-internal-${Date.now()}` : socket.id,
            userId: user.id,
            username: user.name,
            avatarUrl: user.avatar,
            position,
            currentBalance: this.priceCents,
            skin: user.skin || 'default',
            isBot,
            connected: true
        };

        this.players.push(newPlayer);
        this.players.sort((a, b) => a.position - b.position);

        this.broadcastState();

        if (this.players.length === 1) {
            this.scheduleBotEntry();
        } else if (this.players.length === 2) {
            this.cancelBotEntry();
            setTimeout(() => this.startGame(), 500);
        }
    }

    public removePlayer(socketId: string) {
        const playerIndex = this.players.findIndex(p => p.socketId === socketId);
        if (playerIndex === -1) return;

        const player = this.players[playerIndex];

        if (this.status === 'WAITING') {
            this.players.splice(playerIndex, 1);

            if (this.players.length === 0) {
                this.cancelBotEntry();
            } else {
                this.scheduleBotEntry();
            }
            this.broadcastState();
        } else {
            player.connected = false;
            this.broadcastState();
        }
    }

    /**
     * MOTOR DE JUEGO
     */
    private startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.roundReady.clear();
        this.lastDice = null;

        if (this.autoLockTimer) clearTimeout(this.autoLockTimer);

        console.log(`[Sala ${this.id}] 🎮 Legacy Game Started`);
        this.broadcastState();
        this.startActionTimer();
    }

    // El cliente llama a esto cuando presiona "Tirar"
    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING') return;

        // Si ya está ready, ignorar
        if (this.roundReady.has(userId)) return;

        // Marcar ready
        this.roundReady.add(userId);
        this.io.to(this.id).emit('player_ready', { userId }); // Feedback visual

        // Verificar si es necesario activar al BOT
        const opponent = this.players.find(p => p.userId !== userId);
        if (opponent && opponent.isBot && !this.roundReady.has(opponent.userId)) {
            // Bot reacciona rápido
            setTimeout(() => {
                this.handleRoll(opponent.userId);
            }, Math.random() * 1000 + 500);
        }

        // Si ambos ready -> Resolver
        if (this.roundReady.size >= 2) {
            this.resolveRound();
        } else {
            this.broadcastState();
        }
    }

    private resolveRound() {
        if (this.actionTimer) clearTimeout(this.actionTimer);

        // 1. Roll Logic (Legacy: 2 dice per player, no ties)
        const rollDie = () => Math.floor(Math.random() * 6) + 1;

        let p1Dice: [number, number];
        let p2Dice: [number, number];
        let p1Sum = 0;
        let p2Sum = 0;

        // Loop hasta que no haya empate
        do {
            p1Dice = [rollDie(), rollDie()];
            p2Dice = [rollDie(), rollDie()];
            p1Sum = p1Dice[0] + p1Dice[1];
            p2Sum = p2Dice[0] + p2Dice[1];
        } while (p1Sum === p2Sum);

        this.lastDice = { p1: p1Dice, p2: p2Dice };

        // 2. Determine Winner
        const p1 = this.players[0]; // Position 1
        const p2 = this.players[1]; // Position 2

        let winnerId: string;

        if (p1Sum > p2Sum) {
            winnerId = p1.userId;
            p1.currentBalance += this.stepValue;
            p2.currentBalance -= this.stepValue;
        } else {
            winnerId = p2.userId;
            p2.currentBalance += this.stepValue;
            p1.currentBalance -= this.stepValue;
        }

        // Clamp balances
        if (p1.currentBalance < 0) p1.currentBalance = 0;
        if (p2.currentBalance < 0) p2.currentBalance = 0;

        // 3. Emit Result
        this.io.to(this.id).emit('round_result', {
            dice: this.lastDice,
            winnerId,
            players: this.players.map(p => ({ userId: p.userId, balance: p.currentBalance })),
            // Legacy format extra info if needed
            p1Sum,
            p2Sum
        });

        // 4. Check Match End
        const bankrupt = this.players.find(p => p.currentBalance <= 0);
        if (bankrupt) {
            const winner = this.players.find(p => p.userId !== bankrupt.userId);
            setTimeout(() => this.finishGame(winner!), 3000);
        } else {
            // Next Round
            setTimeout(() => this.nextRound(), 4000); // 4s para ver resultado
        }
    }

    private nextRound() {
        this.round++;
        this.roundReady.clear();
        this.lastDice = null;
        this.broadcastState();
        this.startActionTimer();

        // Si hay un bot, quizás él inicia primero a veces?
        // Legacy strategy: Wait for broadcast. Bot logic is in handleRoll trigger or here.
        // Vamos a hacer que si hay un bot, tenga chance de darle "Ready" primero random
        const bot = this.players.find(p => p.isBot);
        if (bot) {
            setTimeout(() => {
                // Solo si sigue siendo la misma ronda y no ha tirado
                if (this.status === 'PLAYING' && !this.roundReady.has(bot.userId)) {
                    this.handleRoll(bot.userId);
                }
            }, Math.random() * 2000 + 1000);
        }
    }

    private startActionTimer() {
        if (this.actionTimer) clearTimeout(this.actionTimer);

        // Timeout para forzar jugada si alguien se duerme
        this.actionTimer = setTimeout(() => {
            if (this.status === 'PLAYING') {
                // Si falta 1, forzamos su roll
                // Si faltan 2, forzamos ambos
                const pending = this.players.filter(p => !this.roundReady.has(p.userId));
                pending.forEach(p => {
                    console.log(`[Sala ${this.id}] Auto-roll for timeout: ${p.username}`);
                    this.handleRoll(p.userId);
                });
            }
        }, ROUND_TIMEOUT_SECONDS * 1000);
    }

    private async finishGame(winner: PlayerState) {
        this.status = 'FINISHED';
        const prizeTotal = this.players.reduce((sum, p) => sum + this.priceCents, 0);

        this.io.to(this.id).emit('game_over', {
            winnerId: winner.userId,
            prize: prizeTotal
        });

        try {
            await prisma.gameResult.create({
                data: {
                    roomId: this.id,
                    winnerUserId: winner.userId,
                    winnerName: winner.username,
                    prizeCents: prizeTotal,
                    roundNumber: this.round
                }
            });
            await prisma.user.update({
                where: { id: winner.userId },
                data: { balanceCents: { increment: prizeTotal } }
            });
            await prisma.room.update({
                where: { id: this.id },
                data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId }
            });
        } catch (e) { console.error("Error DB finishGame:", e); }
    }

    // --- UTILS ---

    private scheduleBotEntry() {
        if (this.botInjectionTimer) clearTimeout(this.botInjectionTimer);
        if (this.botWaitMs > 0 && this.players.length === 1 && !this.players[0].isBot) {
            this.botInjectionTimer = setTimeout(() => this.injectBot(), this.botWaitMs);
        }
    }

    private cancelBotEntry() {
        if (this.botInjectionTimer) {
            clearTimeout(this.botInjectionTimer);
            this.botInjectionTimer = null;
        }
    }

    private async injectBot() {
        if (this.status !== 'WAITING' || this.players.length !== 1) return;
        try {
            const botUser = await prisma.user.findFirst({ where: { isBot: true } });
            if (botUser) {
                const mockSocket = { id: `bot-internal-${Date.now()}` } as any;
                this.addPlayer(mockSocket, {
                    id: botUser.id,
                    name: botUser.username || "Bot",
                    skin: botUser.selectedDiceColor || "red",
                    avatar: botUser.avatarUrl || ""
                }, true);
            }
        } catch (error) { console.error("Error injectBot:", error); }
    }

    private scheduleAutoLock() {
        if (!this.autoLockAt) return;
        const now = new Date();
        const delay = this.autoLockAt.getTime() - now.getTime();
        this.autoLockTimer = setTimeout(() => {
            if (this.status === 'WAITING' && this.players.length < 2) {
                this.closeRoom("Tiempo expirado");
            }
        }, Math.max(0, delay));
    }

    private async closeRoom(reason: string) {
        this.status = 'CLOSED';
        this.cancelBotEntry();
        this.io.to(this.id).emit('room_closed', { reason });
        await prisma.room.update({ where: { id: this.id }, data: { state: 'LOCKED', lockedAt: new Date() } }).catch(() => { });
    }

    private broadcastState() {
        this.io.to(this.id).emit('update_game', {
            status: this.status,
            players: this.players.map(p => ({
                userId: p.userId,
                name: p.username,
                balance: p.currentBalance,
                avatar: p.avatarUrl,
                skin: p.skin,
                position: p.position,
                isBot: p.isBot,
                connected: p.connected,
                // UI helper: isReady para saber si ya tiró en esta ronda
                isReady: this.roundReady.has(p.userId)
            })),
            round: this.round,
            lastDice: this.lastDice,
            pot: this.players.reduce((sum, p) => sum + p.currentBalance, 0)
        });
    }
}
