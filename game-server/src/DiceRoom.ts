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
    // Memoria estática para evitar que el mismo bot juegue en 2 salas a la vez
    public static activeBotIds: Set<string> = new Set();

    public id: string;
    public priceCents: number;
    public stepValue: number;
    public botWaitMs: number;
    public autoLockAt: Date | null;
    public durationSeconds: number; // Nuevo: Tiempo límite de sala abierta

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

    // Para la lógica de "Jugar de nuevo" con el mismo bot
    private lastBotId: string | null = null;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, durationSeconds: number, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.durationSeconds = durationSeconds || 600; // Por defecto 10 min si no viene
        this.io = io;
    }

    public async addPlayer(socket: Socket, user: any, isBot: boolean = false, isBuyAttempt: boolean = false) {
        // 1. Validaciones previas
        if (this.players.length >= 2) {
            if (!isBot) socket.emit('error_msg', { message: 'Sala llena' });
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

        // Un bot NUNCA puede entrar si la sala no está en WAITING o si ya hay 2 jugadores
        if (this.status !== 'WAITING') return;

        // Determinar posición
        let pos: 1 | 2 = this.players.some(p => p.position === 1) ? 2 : 1;

        // 2. LOGICA DE COMPRA / RECUPERACIÓN (Solo Humanos)
        if (!isBot) {
            try {
                // Verificar si ya tiene entrada en DB
                const activeEntry = await prisma.entry.findFirst({
                    where: { roomId: this.id, userId: user.id }
                });

                if (activeEntry) {
                    console.log(`[DiceRoom] Usuario ${user.username} recuperado.`);
                    pos = activeEntry.position as 1 | 2;
                } else if (isBuyAttempt) {
                    // COBRO ATÓMICO
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
                            data: { roomId: this.id, userId: user.id, position: pos }
                        })
                    ]);
                } else {
                    return;
                }
            } catch (e: any) {
                console.error("❌ Error CRÍTICO al añadir jugador:", e.message);
                socket.emit('error_msg', { message: 'Error procesando entrada.' });
                return;
            }
        } else {
            // Si es BOT, lo registramos en el Set global para que no entre a otra sala
            DiceRoom.activeBotIds.add(user.id);
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

        if (!this.players.find(p => p.userId === newPlayer.userId)) {
            this.players.push(newPlayer);
            this.players.sort((a, b) => a.position - b.position);
        }

        this.broadcastState();

        // 4. LÓGICA DE BOTS Y TIEMPOS
        if (this.players.length >= 2) {
            // Sala llena: cancelar espera de bot e iniciar juego
            this.cancelBot();
            setTimeout(() => this.startGame(), 2000);
        } else if (this.players.length === 1 && !isBot) {
            // Jugador REAL entró solo: Iniciar cuenta atrás para Bot
            // Y configurar el tiempo de cierre de sala (autoLock) si es necesario
            this.scheduleBot();
            this.updateRoomExpiration();
        }
    }

    public async removePlayer(socketId: string) {
        const p = this.players.find(p => p.socketId === socketId);
        if (!p) return;

        if (this.status === 'WAITING') {
            this.players = this.players.filter(pl => pl.socketId !== socketId);

            // Liberar DB y Global Set
            if (!p.isBot) {
                try {
                    await prisma.entry.deleteMany({ where: { roomId: this.id, userId: p.userId } });
                } catch (e) { console.error(e); }
            } else {
                DiceRoom.activeBotIds.delete(p.userId); // Liberar bot
            }

            // Si no queda nadie, reset total
            if (this.players.length === 0) {
                this.reset();
            }
            // Si queda alguien...
            else if (this.players.length === 1) {
                const survivor = this.players[0];
                if (survivor.isBot) {
                    // ⚠️ REGLA: Un bot NO puede quedarse solo. Se sale.
                    console.log(`[DiceRoom] Bot ${survivor.username} quedó solo. Saliendo...`);
                    this.players = [];
                    DiceRoom.activeBotIds.delete(survivor.userId);
                    this.reset();
                } else {
                    // Si queda un humano, volvemos a llamar al bot
                    this.scheduleBot();
                }
            }
        } else {
            p.connected = false;
        }
        this.broadcastState();
    }

    private updateRoomExpiration() {
        // Actualizar en DB que la sala está "viva" y corriendo tiempo
        // Esto es opcional, depende de si usas autoLockAt para cerrar la sala
        if (!this.autoLockAt) {
            const expiration = new Date(Date.now() + this.durationSeconds * 1000);
            this.autoLockAt = expiration;
            // update db async (fire and forget)
            prisma.room.update({ where: { id: this.id }, data: { autoLockAt: expiration } }).catch(console.error);
        }
    }

    // --- LÓGICA DE INYECCIÓN DE BOTS ---

    private scheduleBot() {
        if (this.botTimer) clearTimeout(this.botTimer);
        // Solo programar si hay 1 jugador, es WAITING y el tiempo de espera > 0
        if (this.players.length === 1 && this.status === 'WAITING' && this.botWaitMs > 0) {
            console.log(`[DiceRoom] 🤖 Bot programado en ${this.botWaitMs / 1000}s`);
            this.botTimer = setTimeout(() => this.injectBot(), this.botWaitMs);
        }
    }

    private cancelBot() {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
    }

    private async injectBot() {
        // Verificar doble check
        if (this.players.length !== 1 || this.status !== 'WAITING') return;

        try {
            // 1. Obtener todos los bots disponibles de la DB
            const allBots = await prisma.user.findMany({
                where: { isBot: true },
                select: { id: true, name: true, avatarUrl: true, selectedDiceColor: true }
            });

            if (allBots.length === 0) return;

            // 2. Filtrar bots que ya están ocupados en otras salas
            const availableBots = allBots.filter(b => !DiceRoom.activeBotIds.has(b.id));

            if (availableBots.length === 0) {
                console.log("[DiceRoom] Todos los bots están ocupados.");
                // Reintentar en 5 segundos
                this.botTimer = setTimeout(() => this.injectBot(), 5000);
                return;
            }

            let selectedBot = null;

            // 3. Lógica de "Revancha": A veces (40%) intentar traer el mismo bot anterior
            const wantsRematch = Math.random() < 0.4;
            if (this.lastBotId && wantsRematch) {
                const previousBot = availableBots.find(b => b.id === this.lastBotId);
                if (previousBot) {
                    selectedBot = previousBot;
                    console.log(`[DiceRoom] 🤖 Regresando al bot ${selectedBot.name} para revancha.`);
                }
            }

            // Si no hay revancha o el anterior está ocupado, elegir uno nuevo al azar
            if (!selectedBot) {
                const randomIndex = Math.floor(Math.random() * availableBots.length);
                selectedBot = availableBots[randomIndex];
            }

            // 4. Meter al bot
            console.log(`[DiceRoom] 🤖 Insertando bot: ${selectedBot.name}`);
            await this.addPlayer({ id: 'bot' } as any, {
                id: selectedBot.id,
                name: selectedBot.name,
                avatar: selectedBot.avatarUrl,
                selectedDiceColor: selectedBot.selectedDiceColor || 'red'
            }, true); // isBot = true

            // Guardar referencia para la próxima
            this.lastBotId = selectedBot.id;

        } catch (e) {
            console.error("Error injectBot:", e);
        }
    }

    // --- JUEGO ---

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

    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING') return;
        if (this.turnUserId !== userId) return;
        if (this.rolls[userId]) return; // Ya tiró

        const roll: [number, number] = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        this.rolls[userId] = roll;

        if (this.timer) clearTimeout(this.timer);

        this.io.to(this.id).emit('dice_anim', { userId, result: roll });

        // Esperar animación
        setTimeout(() => {
            const opponent = this.players.find(p => p.userId !== userId);

            if (opponent && !this.rolls[opponent.userId]) {
                // Cambio de turno
                this.turnUserId = opponent.userId;
                this.processTurn(); // Iniciar tiempo del siguiente
                this.broadcastState();
            } else {
                // Ambos tiraron
                this.resolveRound();
            }
        }, 1500);
    }

    private processTurn() {
        if (this.timer) clearTimeout(this.timer);

        const p = this.players.find(pl => pl.userId === this.turnUserId);
        if (!p) return;

        // Establecer tiempo límite real (30s)
        this.turnExpiresAt = Date.now() + TURN_TIMEOUT_MS;

        if (p.isBot) {
            // 🤖 COMPORTAMIENTO HUMANO DEL BOT
            // Tirar en un tiempo aleatorio entre 3s y 28s para parecer humano
            const minDelay = 3000;
            const maxDelay = 28000;
            const humanDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);

            console.log(`[DiceRoom] Bot ${p.username} tirará en ${humanDelay / 1000}s`);

            this.timer = setTimeout(() => {
                this.handleRoll(p.userId);
            }, humanDelay);

        } else {
            // Jugador Real: Esperar Timeout
            this.timer = setTimeout(() => {
                this.handleTurnTimeout(p.userId);
            }, TURN_TIMEOUT_MS);
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

            // Actualizar que terminó, pero NO borrar la sala, solo marcar finished
            await prisma.room.update({ where: { id: this.id }, data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId } });
        } catch (e) { console.error(e) }

        console.log(`[DiceRoom ${this.id}] Partida finalizada. Reset en 8s.`);

        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.reset();
        }, 8000);
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


    public updateSkin(userId: string, skin: string) {
        const p = this.players.find(p => p.userId === userId);
        if (p) {
            p.skin = skin;
            this.broadcastState();
        }
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

        // Liberar bots globales antes de borrar la lista local
        this.players.forEach(p => {
            if (p.isBot) DiceRoom.activeBotIds.delete(p.userId);
        });

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
