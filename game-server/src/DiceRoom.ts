// game-server/src/DiceRoom.ts
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PERCENTAGE_PER_ROUND = 0.20;
const TURN_TIMEOUT_SECONDS = 15;

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
    public turnUserId: string | null = null;
    public rolls: { [userId: string]: number } = {};

    private io: Server;
    private turnTimer: NodeJS.Timeout | null = null;
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
        // 1. Reconexión
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            // Si es bot, mantenemos su ID interno, si es humano actualizamos socket
            if (!isBot) existing.socketId = socket.id;

            existing.connected = true;
            this.broadcastState(); // <--- IMPORTANTE: Avisar inmediatamente
            return;
        }

        if (this.players.length >= 2 || this.status !== 'WAITING') {
            // Avoid adding more players if full or already playing
            if (!isBot) socket.emit('error', { message: 'Sala llena o en juego' });
            return;
        }

        // 2. Asignar Posición Correcta
        // Si ya existe la pos 1, asignamos la 2. Si no, la 1.
        const takenPositions = this.players.map(p => p.position);
        const position = takenPositions.includes(1) ? 2 : 1;

        const newPlayer: PlayerState = {
            socketId: isBot ? `bot-internal-${Date.now()}` : socket.id, // ID seguro para el bot
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
        // Ordenar siempre: Posición 1 primero
        this.players.sort((a, b) => a.position - b.position);

        console.log(`[Sala ${this.id}] Entró ${newPlayer.username} (Pos: ${position}, Bot: ${isBot})`);

        // 3. Emitir estado NUEVO a todos
        this.broadcastState();

        // 4. Gestión de Juego
        if (this.players.length === 1) {
            this.scheduleBotEntry();
        } else if (this.players.length === 2) {
            this.cancelBotEntry();
            // Pequeño delay para asegurar que el cliente procesó el "player_join" antes del "start"
            setTimeout(() => this.startGame(), 500);
        }
    }

    public removePlayer(socketId: string) {
        const playerIndex = this.players.findIndex(p => p.socketId === socketId);
        if (playerIndex === -1) return;

        const player = this.players[playerIndex];

        // ESCENARIO A: Juego en espera (WAITING)
        // Eliminamos al jugador totalmente para liberar el hueco
        if (this.status === 'WAITING') {
            this.players.splice(playerIndex, 1);
            console.log(`[Sala ${this.id}] Jugador ${player.username} salió (WAITING). Hueco liberado.`);

            // Si la sala quedó vacía, limpiamos el timer del bot
            if (this.players.length === 0) {
                this.cancelBotEntry();
            } else {
                // Si quedó 1 persona, reiniciamos el timer del bot
                this.scheduleBotEntry();
            }

            this.broadcastState();
        }
        // ESCENARIO B: Juego en curso (PLAYING/FINISHED)
        // No eliminamos, solo marcamos desconectado (puede volver)
        else {
            player.connected = false;
            console.log(`[Sala ${this.id}] Jugador ${player.username} desconectado (en juego).`);
            this.broadcastState();
        }
    }

    /**
     * LOGICA DE TIMERS
     */
    private scheduleBotEntry() {
        // Limpieza preventiva
        if (this.botInjectionTimer) clearTimeout(this.botInjectionTimer);

        // Solo programar si: hay 1 jugador, no es bot, y hay tiempo configurado
        if (this.botWaitMs > 0 && this.players.length === 1 && !this.players[0].isBot) {
            console.log(`[Sala ${this.id}] ⏳ Esperando bot en ${this.botWaitMs}ms`);

            this.botInjectionTimer = setTimeout(() => {
                this.injectBot();
            }, this.botWaitMs);
        }
    }

    private cancelBotEntry() {
        if (this.botInjectionTimer) {
            clearTimeout(this.botInjectionTimer);
            this.botInjectionTimer = null;
        }
    }

    private async injectBot() {
        // Doble check de seguridad
        if (this.status !== 'WAITING' || this.players.length !== 1) return;

        try {
            const botUser = await prisma.user.findFirst({
                where: { isBot: true },
            });

            if (botUser) {
                console.log(`[Sala ${this.id}] 🤖 Bot ${botUser.username} entrando...`);
                // Simulamos socket con ID especial
                const mockSocket = { id: `bot-${Date.now()}` } as any;

                this.addPlayer(mockSocket, {
                    id: botUser.id,
                    name: botUser.username || "Bot",
                    skin: botUser.selectedDiceColor || "red",
                    avatar: botUser.avatarUrl || ""
                }, true);
            }
        } catch (error) {
            console.error("Error injectBot:", error);
        }
    }

    private scheduleAutoLock() {
        if (!this.autoLockAt) return;
        const now = new Date();
        const delay = this.autoLockAt.getTime() - now.getTime();

        if (delay <= 0) {
            this.closeRoom("Tiempo expirado");
        } else {
            this.autoLockTimer = setTimeout(() => {
                // Solo cerramos si sigue esperando
                if (this.status === 'WAITING' && this.players.length < 2) {
                    this.closeRoom("Tiempo expirado");
                }
            }, delay);
        }
    }

    private async closeRoom(reason: string) {
        this.status = 'CLOSED';
        this.cancelBotEntry();
        this.io.to(this.id).emit('room_closed', { reason });
        try {
            await prisma.room.update({
                where: { id: this.id },
                data: { state: 'LOCKED', lockedAt: new Date() }
            });
        } catch (e) { }
    }

    /**
     * MOTOR DE JUEGO
     */
    private startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.rolls = {};

        // Cancelar timer de cierre si empezó el juego
        if (this.autoLockTimer) clearTimeout(this.autoLockTimer);

        // Turno inicial: Jugador en Posición 1
        const p1 = this.players.find(p => p.position === 1);
        this.turnUserId = p1 ? p1.userId : this.players[0].userId;

        console.log(`[Sala ${this.id}] 🎮 Juego iniciado. Turno: ${this.turnUserId}`);
        this.broadcastState();
        this.startTurnTimer();
    }

    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING') return;
        if (this.turnUserId !== userId) return;
        if (this.rolls[userId]) return;

        // Generar tiro (1-6)
        const val = Math.floor(Math.random() * 6) + 1;
        this.rolls[userId] = val;

        // Emitir SOLO el evento de dados para animación rápida
        this.io.to(this.id).emit('dice_rolled', { userId, value: val });

        // Verificamos oponente
        const opponent = this.players.find(p => p.userId !== userId);

        if (opponent && !this.rolls[opponent.userId]) {
            // Cambio de turno
            this.turnUserId = opponent.userId;
            this.broadcastState(); // Actualizar UI con nuevo turno
            this.startTurnTimer();
        } else {
            // Fin de ronda
            this.resolveRound();
        }
    }

    private resolveRound() {
        this.turnUserId = null;
        if (this.turnTimer) clearTimeout(this.turnTimer);

        // Esperar un poco para que la animación de dados termine en el cliente (1s)
        setTimeout(() => {
            const p1 = this.players[0];
            const p2 = this.players[1];
            const val1 = this.rolls[p1.userId];
            const val2 = this.rolls[p2.userId];

            let winnerId: string | null = "TIE";

            if (val1 > val2) {
                winnerId = p1.userId;
                p1.currentBalance += this.stepValue;
                p2.currentBalance -= this.stepValue;
            } else if (val2 > val1) {
                winnerId = p2.userId;
                p2.currentBalance += this.stepValue;
                p1.currentBalance -= this.stepValue;
            }

            // Validar límites (no negativos)
            if (p1.currentBalance < 0) p1.currentBalance = 0;
            if (p2.currentBalance < 0) p2.currentBalance = 0;

            // Emitir resultado
            this.io.to(this.id).emit('round_result', {
                rolls: this.rolls,
                winnerId,
                players: this.players.map(p => ({ userId: p.userId, balance: p.currentBalance }))
            });

            // Verificar Game Over
            const bankrupt = this.players.find(p => p.currentBalance <= 0);
            if (bankrupt) {
                const winner = this.players.find(p => p.userId !== bankrupt.userId);
                setTimeout(() => this.finishGame(winner!), 2000); // 2s drama
            } else {
                setTimeout(() => this.nextRound(), 3000); // 3s para ver resultado
            }
        }, 800); // Delay animación
    }

    private nextRound() {
        this.round++;
        this.rolls = {};
        // P1 siempre empieza ronda (regla simple)
        this.turnUserId = this.players.find(p => p.position === 1)?.userId || null;

        this.broadcastState();
        this.startTurnTimer();
    }

    private startTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);

        const currentPlayer = this.players.find(p => p.userId === this.turnUserId);
        if (!currentPlayer) return;

        // Si es BOT: Tirar rápido (humanizado 1.5s - 3s)
        if (currentPlayer.isBot) {
            const delay = Math.floor(Math.random() * 1500) + 1500;
            this.turnTimer = setTimeout(() => this.handleRoll(currentPlayer.userId), delay);
        } else {
            // Si es Humano: 15s límite
            this.turnTimer = setTimeout(() => {
                if (this.status === 'PLAYING') {
                    // Auto-roll por timeout
                    this.handleRoll(currentPlayer.userId);
                }
            }, TURN_TIMEOUT_SECONDS * 1000);
        }
    }

    private async finishGame(winner: PlayerState) {
        this.status = 'FINISHED';
        const prizeTotal = this.players.reduce((sum, p) => sum + this.priceCents, 0); // Pozo total (apuesta A + apuesta B)

        this.io.to(this.id).emit('game_over', {
            winnerId: winner.userId,
            prize: prizeTotal
        });

        // Persistencia DB
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
                connected: p.connected
            })),
            turnUserId: this.turnUserId,
            round: this.round,
            rolls: this.rolls,
            pot: this.players.reduce((sum, p) => sum + p.currentBalance, 0)
        });
    }
}
