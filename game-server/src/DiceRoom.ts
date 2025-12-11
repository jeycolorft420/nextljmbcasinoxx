import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuración de juego
const PERCENTAGE_PER_ROUND = 0.20; // 20% de la apuesta base
const TURN_TIMEOUT_SECONDS = 15;   // 15 seg para tirar o tira auto

interface PlayerState {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl?: string;
    position: 1 | 2; // 1 = Arriba (Host), 2 = Abajo (Retador)
    currentBalance: number;
    skin: string;
    isBot: boolean;
    connected: boolean;
    hasRolled: boolean; // Para controlar quién falta por tirar en la ronda
}

export class DiceRoom {
    public id: string;
    public priceCents: number;
    public stepValue: number;

    public botWaitMs: number;
    public autoLockAt: Date | null;

    public players: PlayerState[] = [];
    // Usamos estados estándar para que el frontend entienda
    public status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CLOSED' = 'WAITING';

    public round: number = 1;
    // Guardamos los dados de la ronda actual { "userId": [4, 2] }
    public currentRolls: { [userId: string]: [number, number] } = {};

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

    // --- GESTIÓN DE JUGADORES ---

    public addPlayer(socket: Socket, user: { id: string, name: string, skin: string, avatar?: string }, isBot: boolean = false) {
        // 1. Reconexión
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

        // 2. Asignar Posición
        const position = this.players.some(p => p.position === 1) ? 2 : 1;

        const newPlayer: PlayerState = {
            socketId: isBot ? `bot-${Date.now()}` : socket.id,
            userId: user.id,
            username: user.name,
            avatarUrl: user.avatar,
            position,
            currentBalance: this.priceCents,
            skin: user.skin || 'default',
            isBot,
            connected: true,
            hasRolled: false
        };

        this.players.push(newPlayer);
        // Ordenar: Posición 1 siempre primero en el array
        this.players.sort((a, b) => a.position - b.position);

        this.broadcastState();

        // 3. Control de Flujo
        if (this.players.length === 1) {
            this.scheduleBotEntry();
        } else if (this.players.length === 2) {
            this.cancelBotEntry();
            if (this.autoLockTimer) clearTimeout(this.autoLockTimer);

            // Iniciar juego con un pequeño delay para que el front cargue los avatares
            setTimeout(() => this.startGame(), 500);
        }
    }

    public removePlayer(socketId: string) {
        const index = this.players.findIndex(p => p.socketId === socketId);
        if (index === -1) return;

        const player = this.players[index];

        if (this.status === 'WAITING') {
            // Si no ha empezado, lo sacamos del todo
            this.players.splice(index, 1);

            // Si queda vacío o con 1, gestionar timers
            if (this.players.length === 0) {
                this.cancelBotEntry();
            } else if (this.players.length === 1 && !this.players[0].isBot) {
                this.scheduleBotEntry();
            }
        } else {
            // Si ya empezó, solo marcamos desconectado
            player.connected = false;
        }
        this.broadcastState();
    }

    // --- LÓGICA DEL JUEGO ---

    private startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.currentRolls = {};
        this.players.forEach(p => p.hasRolled = false);

        console.log(`[Sala ${this.id}] START GAME. Players: ${this.players.map(p => p.username).join(', ')}`);

        this.broadcastState();
        this.checkBotTurn(); // Si hay bot, que tire
        this.startTurnTimer();
    }

    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING') return;

        const player = this.players.find(p => p.userId === userId);
        if (!player || player.hasRolled) return; // Ya tiró o no existe

        // 1. Generar Dados
        const roll: [number, number] = [
            Math.ceil(Math.random() * 6),
            Math.ceil(Math.random() * 6)
        ];

        this.currentRolls[userId] = roll;
        player.hasRolled = true;

        // Emitir evento específico de tiro (para animación)
        this.io.to(this.id).emit('dice_rolled', { userId, roll });

        // Actualizar estado general
        this.broadcastState();

        // 2. Verificar si ambos tiraron
        const allRolled = this.players.every(p => p.hasRolled);
        if (allRolled) {
            if (this.turnTimer) clearTimeout(this.turnTimer);
            // Delay para ver los dados antes de calcular ganador (1.5s)
            setTimeout(() => this.resolveRound(), 1500);
        } else {
            // Falta el otro jugador, reiniciar timer para él
            this.checkBotTurn();
        }
    }

    private resolveRound() {
        const p1 = this.players[0];
        const p2 = this.players[1];

        if (!p1 || !p2) return; // Seguridad

        const roll1 = this.currentRolls[p1.userId];
        const roll2 = this.currentRolls[p2.userId];

        const sum1 = roll1[0] + roll1[1];
        const sum2 = roll2[0] + roll2[1];

        let winnerId: string | null = null; // null = Empate

        if (sum1 > sum2) {
            winnerId = p1.userId;
            p1.currentBalance += this.stepValue;
            p2.currentBalance -= this.stepValue;
        } else if (sum2 > sum1) {
            winnerId = p2.userId;
            p2.currentBalance += this.stepValue;
            p1.currentBalance -= this.stepValue;
        }

        // Evitar saldos negativos visuales
        if (p1.currentBalance < 0) p1.currentBalance = 0;
        if (p2.currentBalance < 0) p2.currentBalance = 0;

        // Emitir resultado de ronda
        this.io.to(this.id).emit('round_result', {
            winnerId,
            rolls: this.currentRolls,
            balances: {
                [p1.userId]: p1.currentBalance,
                [p2.userId]: p2.currentBalance
            }
        });

        // Verificar Fin del Juego (Bancarrota)
        const bankrupt = this.players.find(p => p.currentBalance <= 0);

        if (bankrupt) {
            const winner = this.players.find(p => p.userId !== bankrupt.userId);
            setTimeout(() => this.finishGame(winner!), 2000);
        } else {
            // Siguiente ronda
            setTimeout(() => this.nextRound(), 3000);
        }
    }

    private nextRound() {
        this.round++;
        this.currentRolls = {};
        this.players.forEach(p => p.hasRolled = false);

        this.broadcastState();
        this.checkBotTurn();
        this.startTurnTimer();
    }

    private async finishGame(winner: PlayerState) {
        this.status = 'FINISHED';
        if (this.turnTimer) clearTimeout(this.turnTimer);

        const prizeTotal = this.players.reduce((sum, p) => sum + this.priceCents, 0);

        this.io.to(this.id).emit('game_over', {
            winnerId: winner.userId,
            prize: prizeTotal
        });

        this.broadcastState();

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

    // --- TIMERS & BOTS ---

    private startTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);

        this.turnTimer = setTimeout(() => {
            // Si se acaba el tiempo, forzamos tiro a quien falte
            if (this.status === 'PLAYING') {
                this.players.forEach(p => {
                    if (!p.hasRolled) this.handleRoll(p.userId);
                });
            }
        }, TURN_TIMEOUT_SECONDS * 1000);
    }

    private checkBotTurn() {
        // Busca si hay un bot que NO ha tirado
        const pendingBot = this.players.find(p => p.isBot && !p.hasRolled);

        if (pendingBot) {
            // Delay aleatorio humano (1s - 2.5s)
            const delay = Math.floor(Math.random() * 1500) + 1000;
            setTimeout(() => {
                if (this.status === 'PLAYING' && !pendingBot.hasRolled) {
                    this.handleRoll(pendingBot.userId);
                }
            }, delay);
        }
    }

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
                // Mock socket para el bot
                const mockSocket = { id: `bot-int-${Date.now()}` } as any;
                this.addPlayer(mockSocket, {
                    id: botUser.id,
                    name: botUser.name || "Bot",
                    skin: botUser.selectedDiceColor || "red",
                    avatar: botUser.avatarUrl || ""
                }, true);
            }
        } catch (e) { console.error("Error bot injection", e); }
    }

    private scheduleAutoLock() {
        if (!this.autoLockAt) return;
        const delay = this.autoLockAt.getTime() - new Date().getTime();
        this.autoLockTimer = setTimeout(() => {
            if (this.status === 'WAITING' && this.players.length < 2) {
                this.status = 'CLOSED';
                this.io.to(this.id).emit('room_closed', { reason: 'Expirada' });
                // Actualizar DB...
            }
        }, Math.max(0, delay));
    }

    // --- COMUNICACIÓN AL FRONTEND ---

    private broadcastState() {
        // Construimos el objeto exacto que tu frontend necesita
        // Mapeamos 'players' a los huecos del frontend

        const payload = {
            id: this.id,
            status: this.status, // WAITING, PLAYING, FINISHED
            round: this.round,

            // Array de jugadores limpio
            players: this.players.map(p => ({
                userId: p.userId,
                name: p.username,
                avatar: p.avatarUrl,
                balance: p.currentBalance,
                skin: p.skin,
                position: p.position,
                isBot: p.isBot,
                hasRolled: p.hasRolled,
                connected: p.connected
            })),

            // Estado de dados actual (para que los nuevos espectadores vean qué salió)
            currentRolls: this.currentRolls,

            // Total en juego
            pot: this.players.reduce((sum, p) => sum + p.currentBalance, 0)
        };

        this.io.to(this.id).emit('update_game', payload);
    }
}
