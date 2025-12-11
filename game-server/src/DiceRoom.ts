// game-server/src/DiceRoom.ts
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PERCENTAGE_PER_ROUND = 0.20;
const ROUND_TIMEOUT_SECONDS = 30; // 30s as seen in screenshot

interface PlayerState {
    socketId: string;
    userId: string;
    username: string;
    email?: string; // Legacy needs email field sometimes
    avatarUrl?: string;
    position: 1 | 2;
    currentBalance: number;
    skin: string;
    isBot: boolean;
    connected: boolean;
    ready: boolean;
}

// Legacy format: top/bottom
interface RoundDice {
    top: [number, number];
    bottom: [number, number];
}

export class DiceRoom {
    public id: string;
    public priceCents: number;
    public stepValue: number;

    public botWaitMs: number;
    public autoLockAt: Date | null;

    public players: PlayerState[] = [];
    public status: 'OPEN' | 'LOCKED' | 'FINISHED' | 'CLOSED' = 'OPEN'; // Mapped to Legacy RoomState

    public round: number = 1;
    public lastDice: RoundDice | null = null;
    public history: any[] = []; // Legacy history buffer

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

    public addPlayer(socket: Socket, user: { id: string, name: string, email?: string, skin: string, avatar?: string }, isBot: boolean = false) {
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        if (this.players.length >= 2) {
            if (!isBot) socket.emit('error', { message: 'Sala llena' });
            return;
        }

        const takenPositions = this.players.map(p => p.position);
        const position = takenPositions.includes(1) ? 2 : 1;

        const newPlayer: PlayerState = {
            socketId: isBot ? `bot-internal-${Date.now()}` : socket.id,
            userId: user.id,
            username: user.name,
            email: user.email || `bot-${Date.now()}@example.com`,
            avatarUrl: user.avatar,
            position,
            currentBalance: this.priceCents,
            skin: user.skin || 'default', // Legacy uses colors: "red", "blue"
            isBot,
            connected: true,
            ready: false
        };

        this.players.push(newPlayer);
        this.players.sort((a, b) => a.position - b.position);

        // State Check
        if (this.players.length === 2) {
            this.status = 'LOCKED'; // Playing state in Legacy is often LOCKED
            this.cancelBotEntry();
            setTimeout(() => this.startGame(), 200);
        } else {
            this.status = 'OPEN';
            this.scheduleBotEntry();
        }

        this.broadcastState();
    }

    public removePlayer(socketId: string) {
        const playerIndex = this.players.findIndex(p => p.socketId === socketId);
        if (playerIndex === -1) return;

        const player = this.players[playerIndex];

        // If game hasn't really started (OPEN), remove fully
        if (this.status === 'OPEN') {
            this.players.splice(playerIndex, 1);
            if (this.players.length === 0) {
                this.cancelBotEntry();
            } else {
                this.scheduleBotEntry();
            }
        } else {
            player.connected = false;
        }
        this.broadcastState();
    }

    private startGame() {
        this.round = 1;
        this.players.forEach(p => p.ready = false);
        this.lastDice = null;
        if (this.autoLockTimer) clearTimeout(this.autoLockTimer);
        this.startActionTimer();
        this.broadcastState();
    }

    public handleRoll(userId: string) {
        if (this.status !== 'LOCKED') return; // Must be in playing state

        const player = this.players.find(p => p.userId === userId);
        if (!player || player.ready) return;

        player.ready = true;
        this.broadcastState(); // Update UI to show "Ready" checkmark or status

        // Bot Trigger
        const bot = this.players.find(p => p.isBot && !p.ready);
        if (bot) {
            setTimeout(() => this.handleRoll(bot.userId), Math.random() * 1000 + 500);
        }

        // Check if all ready
        if (this.players.every(p => p.ready)) {
            this.resolveRound();
        }
    }

    private resolveRound() {
        if (this.actionTimer) clearTimeout(this.actionTimer);

        // Roll Logic (Legacy: Top vs Bottom, no ties)
        const rollDie = () => Math.floor(Math.random() * 6) + 1;

        let top: [number, number];
        let bottom: [number, number];
        let topSum = 0;
        let bottomSum = 0;

        do {
            top = [rollDie(), rollDie()];
            bottom = [rollDie(), rollDie()];
            topSum = top[0] + top[1];
            bottomSum = bottom[0] + bottom[1];
        } while (topSum === bottomSum);

        this.lastDice = { top, bottom };

        // Determine Winner (Player 1 is Top, Player 2 is Bottom usually)
        // Legacy: room.entries[0] is Top, room.entries[1] is Bottom
        const p1 = this.players[0];
        const p2 = this.players[1];

        let winnerId: string;

        if (topSum > bottomSum) {
            winnerId = p1.userId;
            p1.currentBalance += this.stepValue;
            p2.currentBalance -= this.stepValue;
        } else {
            winnerId = p2.userId;
            p2.currentBalance += this.stepValue;
            p1.currentBalance -= this.stepValue;
        }

        // Clamp
        if (p1.currentBalance < 0) p1.currentBalance = 0;
        if (p2.currentBalance < 0) p2.currentBalance = 0;

        // Add to History
        this.history.push({
            at: new Date(),
            round: this.round,
            dice: this.lastDice,
            winnerEntryId: winnerId, // Using userId as entryId proxy for simplicity
            balancesAfter: {
                [p1.userId]: p1.currentBalance,
                [p2.userId]: p2.currentBalance
            }
        });

        this.broadcastState();

        // Check End
        const bankrupt = this.players.find(p => p.currentBalance <= 0);
        if (bankrupt) {
            const winner = this.players.find(p => p.userId !== bankrupt.userId);
            setTimeout(() => this.finishGame(winner!), 3000);
        } else {
            setTimeout(() => this.nextRound(), 4000);
        }
    }

    private nextRound() {
        this.round++;
        this.players.forEach(p => p.ready = false);
        this.lastDice = null; // Clear dice for next round waiting state
        this.broadcastState();
        this.startActionTimer();

        // Random bot start
        const bot = this.players.find(p => p.isBot);
        if (bot) {
            setTimeout(() => {
                if (this.status === 'LOCKED' && !bot.ready) {
                    this.handleRoll(bot.userId);
                }
            }, Math.random() * 2000 + 1000);
        }
    }

    private startActionTimer() {
        if (this.actionTimer) clearTimeout(this.actionTimer);
        this.actionTimer = setTimeout(() => {
            if (this.status === 'LOCKED') {
                this.players.filter(p => !p.ready).forEach(p => this.handleRoll(p.userId));
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

        // Broadcast final state one last time
        this.broadcastState();

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

    // --- LEGACY PAYLOAD BUILDER ---
    private broadcastState() {
        // Construct "slots" array
        const slots = Array.from({ length: 2 }, (_, idx) => {
            const position = idx + 1;
            const player = this.players.find(p => p.position === position);
            return {
                position,
                taken: !!player,
                user: player ? {
                    id: player.userId,
                    name: player.username,
                    email: player.email,
                    selectedDiceColor: player.skin
                } : null,
                entryId: player ? player.socketId : null, // Proxy for entryId
            };
        });

        // Construct "gameMeta"
        const balances: any = {};
        const ready: any = {};
        this.players.forEach(p => {
            balances[p.userId] = p.currentBalance;
            if (p.ready) ready[p.userId] = true;
        });

        const gameMeta = {
            balances,
            ready,
            history: this.history,
            dice: this.lastDice, // { top: [x,y], bottom: [x,y] }
            ended: this.status === 'FINISHED'
        };

        const payload = {
            id: this.id,
            priceCents: this.priceCents,
            state: this.status, // OPEN, LOCKED, FINISHED
            capacity: 2,

            // Legacy Frontend often expects these directly in root or inside meta
            counts: {
                taken: this.players.length,
                free: 2 - this.players.length
            },
            slots,
            gameMeta,

            // Extra identifiers for easy access
            turnUserId: null, // Legacy doesn't use this anymore
        };

        this.io.to(this.id).emit('update_game', payload);
    }

    // --- TIMERS ---
    private scheduleBotEntry() {
        if (this.botInjectionTimer) clearTimeout(this.botInjectionTimer);
        if (this.botWaitMs > 0 && this.players.length === 1 && !this.players[0].isBot) {
            this.botInjectionTimer = setTimeout(() => this.injectBot(), this.botWaitMs);
        }
    }
    private cancelBotEntry() {
        if (this.botInjectionTimer) { clearTimeout(this.botInjectionTimer); this.botInjectionTimer = null; }
    }
    private async injectBot() {
        if (this.status !== 'OPEN' || this.players.length !== 1) return;
        try {
            const botUser = await prisma.user.findFirst({ where: { isBot: true } });
            if (botUser) {
                const mockSocket = { id: `bot-internal-${Date.now()}` } as any;
                this.addPlayer(mockSocket, {
                    id: botUser.id,
                    name: botUser.username || "Bot",
                    email: botUser.email || "bot@galaxy.com",
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
            if (this.status === 'OPEN' && this.players.length < 2) this.closeRoom("Tiempo expirado");
        }, Math.max(0, delay));
    }
    private async closeRoom(reason: string) {
        this.status = 'CLOSED';
        this.cancelBotEntry();
        this.io.to(this.id).emit('room_closed', { reason });
        await prisma.room.update({ where: { id: this.id }, data: { state: 'LOCKED', lockedAt: new Date() } }).catch(() => { });
    }
}
