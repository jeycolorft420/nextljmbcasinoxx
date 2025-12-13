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

        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.broadcastState();
            return;
        }

        if (this.status !== 'WAITING' && !isBot) return;

        // Calculamos la posición antes de la transacción para usarla en ambos lados
        const pos = this.players.some(p => p.position === 1) ? 2 : 1;

        // 2. SI ES COMPRA EXPLÍCITA: VERIFICAR Y DESCONTAR SALDO (Atomicidad)
        if (isBuyAttempt && !isBot) {
            try {
                // Safeguard: Check if already has entry in DB to avoid double charge
                const activeEntry = await prisma.entry.findFirst({
                    where: { roomId: this.id, userId: user.id }
                });

                if (activeEntry) {
                    console.log(`[DiceRoom] Usuario ${user.username} ya tenía entrada. Recuperando...`);
                    // Proceed to add to memory without charging (Recover)
                } else {
                    console.log(`[DiceRoom] 💳 Iniciando Transacción Atómica para ${user.username}...`);

                    const userDb = await prisma.user.findUnique({ where: { id: user.id } });
                    if (!userDb || userDb.balanceCents < this.priceCents) {
                        socket.emit('error_msg', { message: 'Saldo insuficiente' });
                        return;
                    }

                    // TRANSACCIÓN: Cobrar y Crear Ticket
                    // CORRECCIÓN: Eliminado 'status' porque no existe en el schema de Entry
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
                            }
                        })
                    ]);
                    console.log(`[DiceRoom] ✅ Cobro exitoso. Asiento asignado.`);
                }
            } catch (e: any) {
                console.error("❌ Error en transacción de compra:", e.message);
                socket.emit('error_msg', { message: 'Error procesando el pago. No se descontó saldo.' });
                return; // <--- CRÍTICO: Si falla el pago, NO ENTRA.
            }
        }

        // 3. ÉXITO (O Re-conexión validada): Agregar a memoria
        const newPlayer: Player = {
            socketId: isBot ? 'bot' : socket.id,
            userId: user.id,
            username: user.name || "Jugador",
            avatarUrl: user.avatar || "",
            position: pos, // Usamos la variable calculada arriba
            balance: this.priceCents,
            skin: user.selectedDiceColor || user.activeSkin || 'white',
            isBot,
            connected: true
        };

        this.players.push(newPlayer);
        this.players.sort((a, b) => a.position - b.position);

        this.broadcastState();

        // 4. Iniciar lógica de juego si está lleno
        if (this.players.length >= 2) {
            this.cancelBot();
            setTimeout(() => this.startGame(), 2000);
        } else if (this.players.length === 1) {
            this.scheduleBot();
        }
    }

    public removePlayer(socketId: string) {
        // NOTE: this logic handles "leaving" while waiting.
        // If playing, we just mark disconnect. But user asked for a specific logic.
        // Assuming this method handles the "logic removal" or "disconnect".
        // The original code filtered only if WAITING.

        const p = this.players.find(p => p.socketId === socketId);
        if (!p) return;

        if (this.status === 'WAITING') {
            this.players = this.players.filter(pl => pl.socketId !== socketId);

            if (this.players.length === 0) {
                this.reset(); // Si se van todos, reset total (sin bot)
            } else if (this.players.length === 1 && this.status === 'WAITING') {
                this.scheduleBot(); // Si queda uno solo esperando, llamar al bot
            }
        } else {
            p.connected = false;
        }
        this.broadcastState();
    }

    public emitStateToSocket(socket: Socket) {
        socket.emit('update_game', this.buildStatePayload());
    }

    private startGame() {
        // Antes de empezar nada, asegúrate de que no haya un zombie corriendo
        this.killGameLoop();

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

        console.log(`[DiceRoom ${this.id}] Partida finalizada. ⏳ Esperando 8s para limpieza automática...`);

        if (this.timer) clearTimeout(this.timer);

        this.timer = setTimeout(() => {
            console.log(`[DiceRoom ${this.id}] ⏰ Tiempo agotado: Ejecutando Auto-Reset.`);
            this.reset();
        }, 8000);
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
        // RACE FIX: Verificar si la situación cambió mientras esperábamos la DB
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
                balance: p.balance, position: p.position, isBot: p.isBot, skin: p.skin, activeSkin: p.skin // Alias for Frontend request
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

    // 1. MÉTODO DE LIMPIEZA PROFUNDA (CORTACABEZAS)
    private killGameLoop() {
        console.log(`[DiceRoom ${this.id}] 🛑 MATANDO procesos anteriores...`);

        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }

        // Detener temporizador principal (Turnos / Bots jugando)
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        // Detener temporizador de búsqueda de bots
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
    }

    public async reset() {
        console.log(`[DiceRoom ${this.id}] ☢️ EJECUTANDO HARD RESET ☢️`);

        // 1. Matar lógica anterior
        this.killGameLoop();
        if (this.botTimer) clearTimeout(this.botTimer);
        this.botTimer = null; // ¡IMPORTANTE!

        // 2. Limpieza de memoria
        this.players = [];
        this.rolls = {};
        this.history = [];
        this.round = 1;
        this.status = 'WAITING';
        this.turnUserId = null;
        this.roundStarterId = null;

        // 3. Sincronizar DB (Resetear a OPEN y BORRAR PARTICIPANTES)
        try {
            // CRÍTICO: Borrar las entradas para que index.ts no los deje volver a entrar
            await prisma.entry.deleteMany({ where: { roomId: this.id } });

            await prisma.room.update({
                where: { id: this.id },
                data: { state: 'OPEN' }
            });
        } catch (e) {
            console.error(`[DiceRoom ${this.id}] DB Reset Error:`, e);
        }

        // 4. Ordenar al Frontend que se limpie
        this.broadcastState();
        this.io.to(this.id).emit('server:room:reset');
        this.io.to(this.id).emit('game:hard_reset');
    }
}
