import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import Pusher from 'pusher';

const prisma = new PrismaClient();

// Configuración de Pusher (Debe coincidir con tu .env)
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true
});

// --- CONFIGURACIÓN DEL JUEGO ---
const PERCENTAGE_PER_ROUND = 0.20;
const TURN_TIMEOUT_MS = 30000;
const ROUND_TRANSITION_MS = 6000;

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
    isTimeout?: boolean;
}

export class DiceRoom {
    public static activeBotIds: Set<string> = new Set();

    public id: string;
    public priceCents: number;
    public stepValue: number;
    public botWaitMs: number;
    public autoLockAt: Date | null;
    public durationSeconds: number;

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
    private gameLoopInterval: NodeJS.Timeout | null = null;
    private lastBotId: string | null = null;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, durationSeconds: number, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.durationSeconds = durationSeconds || 600;
        this.io = io;
    }

    public async addPlayer(socket: Socket, user: any, isBot: boolean = false, isBuyAttempt: boolean = false) {
        if (this.players.length >= 2) {
            if (!isBot) socket.emit('error_msg', { message: 'Sala llena' });
            return;
        }

        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        if (this.status !== 'WAITING' && !isBot) return;

        let pos: 1 | 2 = this.players.some(p => p.position === 1) ? 2 : 1;

        // --- PERSISTENCIA EN BASE DE DATOS (Humanos y Bots) ---
        try {
            const activeEntry = await prisma.entry.findFirst({ where: { roomId: this.id, userId: user.id } });

            if (activeEntry) {
                pos = activeEntry.position as 1 | 2;
            } else {
                if (!isBot && isBuyAttempt) {
                    // Humano comprando
                    const userDb = await prisma.user.findUnique({ where: { id: user.id } });
                    if (!userDb || userDb.balanceCents < this.priceCents) {
                        socket.emit('error_msg', { message: 'Saldo insuficiente' });
                        return;
                    }
                    await prisma.$transaction([
                        prisma.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: this.priceCents } } }),
                        prisma.entry.create({ data: { roomId: this.id, userId: user.id, position: pos } })
                    ]);
                } else if (isBot) {
                    // 🤖 BOT: CREAMOS ENTRADA EN DB PARA QUE EL LOBBY LO CUENTE
                    await prisma.entry.create({
                        data: { roomId: this.id, userId: user.id, position: pos }
                    });
                    DiceRoom.activeBotIds.add(user.id);
                } else {
                    // Humano sin ticket y no está comprando
                    return;
                }
            }
        } catch (e: any) {
            console.error("Error addPlayer:", e);
            if (!isBot) socket.emit('error_msg', { message: 'Error procesando entrada.' });
            return;
        }

        // --- AÑADIR A MEMORIA ---
        const newPlayer: Player = {
            socketId: isBot ? 'bot' : socket.id,
            userId: user.id,
            username: user.name || "Jugador",
            avatarUrl: user.avatar || "",
            position: pos,
            balance: this.priceCents,
            skin: user.selectedDiceColor || user.activeSkin || 'white',
            isBot,
            connected: true
        };

        if (!this.players.find(p => p.userId === newPlayer.userId)) {
            this.players.push(newPlayer);
            this.players.sort((a, b) => a.position - b.position);
        }

        this.broadcastState();
        this.notifyLobby(); // Actualizar lista de salas en tiempo real

        if (this.players.length >= 2) {
            this.cancelBot();
            setTimeout(() => this.startGame(), 2000);
        } else if (this.players.length === 1 && !isBot) {
            this.scheduleBot();
            this.updateRoomExpiration();
        }
    }

    public async removePlayer(socketId: string) {
        const p = this.players.find(p => p.socketId === socketId);
        if (!p) return;

        if (this.status === 'WAITING') {
            this.players = this.players.filter(pl => pl.socketId !== socketId);

            // Eliminar de DB (Sea humano o bot)
            try {
                await prisma.entry.deleteMany({ where: { roomId: this.id, userId: p.userId } });
            } catch (e) { }

            if (p.isBot) {
                DiceRoom.activeBotIds.delete(p.userId);
            }

            this.notifyLobby(); // Actualizar lobby (restar jugador)

            if (this.players.length === 0) {
                this.reset();
            } else if (this.players.length === 1) {
                const survivor = this.players[0];
                if (survivor.isBot) {
                    this.players = [];
                    // Borrar al bot también si se queda solo
                    try { await prisma.entry.deleteMany({ where: { roomId: this.id, userId: survivor.userId } }); } catch (e) { }
                    DiceRoom.activeBotIds.delete(survivor.userId);
                    this.reset();
                } else {
                    this.scheduleBot();
                }
            }
        } else {
            p.connected = false;
        }
        this.broadcastState();
    }

    // --- CORRECCIÓN: Notificación Optimista (Usa Memoria) ---
    private async notifyLobby() {
        try {
            // 1. Usamos MEMORIA para la ocupación real e instantánea (Incluso bots)
            const taken = this.players.length;

            // 2. Obtenemos datos estáticos de la sala
            const roomDB = await prisma.room.findUnique({
                where: { id: this.id }
            });

            if (!roomDB) return;

            // 3. Calculamos estado visual basado en la ocupación real
            let publicState = this.status === 'WAITING' ? 'OPEN' : 'LOCKED';
            if (taken >= roomDB.capacity) publicState = 'LOCKED';
            if (this.status === 'FINISHED') publicState = 'FINISHED';

            const payload = {
                id: roomDB.id,
                title: roomDB.gameType === 'DICE_DUEL' ? 'Sala de Dados' : 'Ruleta',
                priceCents: Number(roomDB.priceCents),
                state: publicState,
                capacity: roomDB.capacity,
                gameType: roomDB.gameType,
                slots: { taken, free: roomDB.capacity - taken },
                autoLockAt: roomDB.autoLockAt ? roomDB.autoLockAt.toISOString() : null
            };

            await pusher.trigger("public-rooms", "room:update", payload);
        } catch (e) {
            console.error("Error notificando a Pusher:", e);
        }
    }

    public playerForfeit(userId: string) {
        if (this.status !== 'PLAYING' && this.status !== 'ROUND_END') return;

        const leaver = this.players.find(p => p.userId === userId);
        const winner = this.players.find(p => p.userId !== userId);

        if (winner && leaver) {
            console.log(`[DiceRoom ${this.id}] 🏳️ ${leaver.username} se ha rendido.`);
            this.io.to(this.id).emit('error_msg', { message: `🏳️ ${leaver.username} abandonó la partida.` });
            this.finishGame(winner, 'FORFEIT');
        }
    }

    private updateRoomExpiration() {
        if (!this.autoLockAt) {
            const expiration = new Date(Date.now() + this.durationSeconds * 1000);
            this.autoLockAt = expiration;
            prisma.room.update({ where: { id: this.id }, data: { autoLockAt: expiration } })
                .then(() => this.notifyLobby()) // Notificar cambio de lock time
                .catch(console.error);
        }
    }

    private scheduleBot() {
        if (this.botTimer) clearTimeout(this.botTimer);
        if (this.players.length === 1 && this.status === 'WAITING' && this.botWaitMs > 0) {
            this.botTimer = setTimeout(() => this.injectBot(), this.botWaitMs);
        }
    }

    private cancelBot() {
        if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    }

    private async injectBot() {
        if (this.players.length !== 1 || this.status !== 'WAITING') return;
        try {
            const allBots = await prisma.user.findMany({ where: { isBot: true } });
            if (allBots.length === 0) return;

            const availableBots = allBots.filter(b => !DiceRoom.activeBotIds.has(b.id));
            if (availableBots.length === 0) {
                this.botTimer = setTimeout(() => this.injectBot(), 5000);
                return;
            }

            let selectedBot = null;
            if (this.lastBotId && Math.random() < 0.4) {
                selectedBot = availableBots.find(b => b.id === this.lastBotId);
            }
            if (!selectedBot) {
                selectedBot = availableBots[Math.floor(Math.random() * availableBots.length)];
            }

            await this.addPlayer({ id: 'bot' } as any, {
                id: selectedBot.id,
                name: selectedBot.name,
                avatar: selectedBot.avatarUrl,
                selectedDiceColor: selectedBot.selectedDiceColor || 'red'
            }, true);

            this.lastBotId = selectedBot.id;
        } catch (e) { console.error("Error injectBot:", e); }
    }

    public emitStateToSocket(socket: Socket) {
        socket.emit('update_game', this.buildStatePayload());
    }

    private startGame() {
        this.killGameLoop();
        this.status = 'PLAYING';

        // Actualizar estado DB a LOCKED/PLAYING
        // Nota: Tu schema usa LOCKED o OPEN. Usualmente al jugar se pone LOCKED.
        prisma.room.update({ where: { id: this.id }, data: { state: 'LOCKED' } })
            .then(() => this.notifyLobby())
            .catch(console.error);

        this.round = 1;
        this.history = [];
        this.rolls = {};
        const firstPlayer = this.players.find(p => p.position === 1);
        this.roundStarterId = firstPlayer?.userId || this.players[0].userId;
        this.turnUserId = this.roundStarterId;
        this.processTurn();
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
                this.processTurn();
                this.broadcastState();
            } else {
                this.resolveRound();
            }
        }, 1500);
    }

    private processTurn() {
        if (this.timer) clearTimeout(this.timer);
        const p = this.players.find(pl => pl.userId === this.turnUserId);
        if (!p) return;

        this.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;

        if (p.isBot) {
            const minDelay = 3000;
            const maxDelay = 28000;
            const humanDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
            this.timer = setTimeout(() => { this.handleRoll(p.userId); }, humanDelay);
        } else {
            this.timer = setTimeout(() => { this.handleTurnTimeout(p.userId); }, TURN_TIMEOUT_MS);
        }
    }

    private handleTurnTimeout(userId: string) {
        if (this.status !== 'PLAYING') return;
        const loser = this.players.find(p => p.userId === userId);
        const winner = this.players.find(p => p.userId !== userId);
        if (!loser || !winner) return;

        this.rolls[userId] = [0, 0];
        this.io.to(this.id).emit('error_msg', { message: `⌛ ¡${loser.username} no tiró a tiempo!` });
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

        if (winnerId) {
            const winner = this.players.find(p => p.userId === winnerId);
            const loser = this.players.find(p => p.userId !== winnerId);
            if (winner && loser) {
                winner.balance += this.stepValue;
                loser.balance -= this.stepValue;
            }
        }
        this.players.forEach(p => { if (p.balance < 0) p.balance = 0; });

        this.history.push({
            round: this.round,
            rolls: JSON.parse(JSON.stringify(this.rolls)),
            winnerId,
            starterId: this.roundStarterId,
            isTimeout
        });

        this.broadcastState();
        this.io.to(this.id).emit('round_result', { winnerId, rolls: this.rolls, isTimeout });

        const bankruptPlayer = this.players.find(p => p.balance <= 0);
        if (bankruptPlayer) {
            const gameWinner = this.players.find(p => p.userId !== bankruptPlayer.userId)!;
            setTimeout(() => this.finishGame(gameWinner, "SCORE"), ROUND_TRANSITION_MS);
        } else {
            setTimeout(() => this.nextRound(winnerId), ROUND_TRANSITION_MS);
        }
    }

    private nextRound(lastWinnerId: string | null) {
        this.round++;
        this.rolls = {};
        this.status = 'PLAYING';
        if (lastWinnerId) {
            this.turnUserId = lastWinnerId;
        } else {
            const currentStarter = this.roundStarterId;
            const nextStarter = this.players.find(p => p.userId !== currentStarter);
            this.turnUserId = nextStarter ? nextStarter.userId : this.players[0].userId;
        }
        this.roundStarterId = this.turnUserId;
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

        this.broadcastState();

        try {
            await prisma.gameResult.create({
                data: { roomId: this.id, winnerUserId: winner.userId, winnerName: winner.username, prizeCents: total, roundNumber: this.round }
            });
            await prisma.user.update({ where: { id: winner.userId }, data: { balanceCents: { increment: total } } });

            // Marcar sala como finalizada
            await prisma.room.update({ where: { id: this.id }, data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId } });

            // Notificar que la sala ya no está disponible
            this.notifyLobby();

        } catch (e) { console.error(e); }

        console.log(`[DiceRoom ${this.id}] Fin del juego (${reason}). Reset en 5s.`);

        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.reset();
        }, 5000);
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
                balance: p.balance, position: p.position, isBot: p.isBot, skin: p.skin, activeSkin: p.skin
            })),
            stepValue: this.stepValue,
            timeLeft: this.status === 'PLAYING' ? Math.max(0, Math.ceil((this.turnExpiresAt - Date.now()) / 1000)) : 0
        };
    }

    private broadcastState() {
        this.io.to(this.id).emit('update_game', this.buildStatePayload());
    }

    public destroy() { this.killGameLoop(); }

    private killGameLoop() {
        if (this.gameLoopInterval) { clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    }

    public async reset() {
        console.log(`[DiceRoom ${this.id}] ☢️ HARD RESET ☢️`);
        this.killGameLoop();

        this.players.forEach(p => { if (p.isBot) DiceRoom.activeBotIds.delete(p.userId); });
        this.players = [];
        this.rolls = {};
        this.history = [];
        this.round = 1;
        this.status = 'WAITING';
        this.turnUserId = null;
        this.roundStarterId = null;

        try {
            await prisma.entry.deleteMany({ where: { roomId: this.id } });
            await prisma.room.update({ where: { id: this.id }, data: { state: 'OPEN' } });
            // Notificar que la sala vuelve a estar OPEN y vacía
            this.notifyLobby();
        } catch (e) { console.error(`[DiceRoom ${this.id}] DB Reset Error:`, e); }

        this.broadcastState();
        this.io.to(this.id).emit('server:room:reset');
        this.io.to(this.id).emit('game:hard_reset');
    }

    public updateSkin(userId: string, skin: string) {
        const p = this.players.find(p => p.userId === userId);
        if (p) {
            p.skin = skin;
            this.broadcastState();
        }
    }
}
