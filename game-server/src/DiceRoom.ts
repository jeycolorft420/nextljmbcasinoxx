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
    isTimeout?: boolean;
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
    private gameLoopInterval: NodeJS.Timeout | null = null;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.io = io;
    }

    public async addPlayer(socket: Socket, user: any, isBot: boolean = false, isBuyAttempt: boolean = false) {
        // 1. Validaciones previas
        if (this.players.length >= 2) {
            socket.emit('error_msg', { message: 'Sala llena' });
            return;
        }

        // Si ya está en memoria, solo reconectar socket
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        if (this.status !== 'WAITING' && !isBot) return;

        // Determinar posición (1 o 2) basada en huecos libres en memoria
        // Si el jugador 1 está ocupado, asignamos el 2, si no el 1.
        let pos: 1 | 2 = this.players.some(p => p.position === 1) ? 2 : 1;

        // 2. LOGICA DE COMPRA / RECUPERACIÓN
        if (!isBot) {
            try {
                // Verificar si ya tiene entrada en DB (recuperación tras reinicio)
                const activeEntry = await prisma.entry.findFirst({
                    where: { roomId: this.id, userId: user.id }
                });

                if (activeEntry) {
                    console.log(`[DiceRoom] Usuario ${user.username} recuperado (ya pagó).`);
                    // Usar la posición que dice la DB para evitar conflictos
                    pos = activeEntry.position as 1 | 2;
                } else if (isBuyAttempt) {
                    // COMPRA NUEVA: TRANSACCIÓN ATÓMICA
                    // Si falla create (por ocupado), falla el cobro.
                    console.log(`[DiceRoom] 💳 Cobrando a ${user.username} por puesto ${pos}...`);

                    const userDb = await prisma.user.findUnique({ where: { id: user.id } });
                    if (!userDb || userDb.balanceCents < this.priceCents) {
                        socket.emit('error_msg', { message: 'Saldo insuficiente' });
                        return;
                    }

                    await prisma.$transaction([
                        prisma.user.update({
                            where: { id: user.id },
                            data: { balanceCents: { decrement: this.priceCents } }
                        }),
                        prisma.entry.create({
                            data: {
                                roomId: this.id,
                                userId: user.id,
                                position: pos
                                // status: 'ACTIVE' <-- ELIMINADO (Causaba el error)
                            }
                        })
                    ]);
                    console.log(`[DiceRoom] ✅ Transacción exitosa.`);
                } else {
                    // No tiene entrada y no está intentando comprar
                    return;
                }
            } catch (e: any) {
                console.error("❌ Error CRÍTICO al añadir jugador:", e.message);
                socket.emit('error_msg', { message: 'Error al procesar la entrada. Si se descontó saldo, contacte a soporte.' });
                return; // Si falló la transacción, no añadimos a memoria.
            }
        }

        // 3. ÉXITO: Agregar a memoria
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

        // Evitar duplicados en memoria por race condition
        if (!this.players.find(p => p.userId === newPlayer.userId)) {
            this.players.push(newPlayer);
            this.players.sort((a, b) => a.position - b.position);
        }

        this.broadcastState();

        // 4. Iniciar lógica de juego si está lleno
        if (this.players.length >= 2) {
            this.cancelBot();
            setTimeout(() => this.startGame(), 2000);
        } else if (this.players.length === 1) {
            this.scheduleBot();
        }
    }

    public async removePlayer(socketId: string) {
        const p = this.players.find(p => p.socketId === socketId);
        if (!p) return;

        if (this.status === 'WAITING') {
            // Si se va mientras espera, lo sacamos de memoria
            this.players = this.players.filter(pl => pl.socketId !== socketId);

            // IMPORTANTE: Liberar el asiento en la DB para que otro pueda entrar
            // Si no hacemos esto, el asiento queda "ocupado" en DB y nadie más puede comprarlo.
            if (!p.isBot) {
                try {
                    await prisma.entry.deleteMany({
                        where: { roomId: this.id, userId: p.userId }
                    });
                    console.log(`[DiceRoom] 🗑️ Entrada liberada para ${p.username}`);
                } catch (e) {
                    console.error("Error liberando entrada:", e);
                }
            }

            if (this.players.length === 0) {
                this.reset();
            } else if (this.players.length === 1 && this.status === 'WAITING') {
                this.scheduleBot();
            }
        } else {
            // Si ya está jugando, solo marcamos desconectado
            p.connected = false;
        }
        this.broadcastState();
    }

    public emitStateToSocket(socket: Socket) {
        socket.emit('update_game', this.buildStatePayload());
    }

    private startGame() {
        this.killGameLoop();

        this.status = 'PLAYING';
        this.round = 1;
        this.history = [];
        this.rolls = {};

        const firstPlayer = this.players.find(p => p.position === 1);
        this.roundStarterId = firstPlayer?.userId || this.players[0].userId;
        this.turnUserId = this.roundStarterId;

        this.processTurn();
        this.broadcastState();
    }

    public updateSkin(userId: string, skin: string) {
        const p = this.players.find(p => p.userId === userId);
        if (p) {
            p.skin = skin;
            this.broadcastState();
        }
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

        this.io.to(this.id).emit('round_result', {
            winnerId,
            rolls: this.rolls,
            isTimeout
        });

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
            await prisma.room.update({ where: { id: this.id }, data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId } });
        } catch (e) { }

        console.log(`[DiceRoom ${this.id}] Partida finalizada. Reset en 8s.`);

        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.reset();
        }, 8000);
    }

    private processTurn() {
        if (this.timer) clearTimeout(this.timer);

        const p = this.players.find(pl => pl.userId === this.turnUserId);
        if (!p) return;

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
        if (this.players.length !== 1 || this.status !== 'WAITING') return;
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
                balance: p.balance, position: p.position, isBot: p.isBot, skin: p.skin, activeSkin: p.skin
            })),
            stepValue: this.stepValue,
            timeLeft: this.status === 'PLAYING' ? Math.max(0, Math.ceil((this.turnExpiresAt - Date.now()) / 1000)) : 0
        };
    }

    private broadcastState() {
        this.io.to(this.id).emit('update_game', this.buildStatePayload());
    }

    public destroy() {
        this.killGameLoop();
    }

    private killGameLoop() {
        if (this.gameLoopInterval) { clearInterval(this.gameLoopInterval); this.gameLoopInterval = null; }
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    }

    public async reset() {
        console.log(`[DiceRoom ${this.id}] ☢️ HARD RESET ☢️`);
        this.killGameLoop();

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
        } catch (e) {
            console.error(`[DiceRoom ${this.id}] DB Reset Error:`, e);
        }

        this.broadcastState();
        this.io.to(this.id).emit('server:room:reset');
        this.io.to(this.id).emit('game:hard_reset');
    }
}
