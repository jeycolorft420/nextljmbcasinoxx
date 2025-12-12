import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- CONFIGURACIÓN ---
const PERCENTAGE_PER_ROUND = 0.20; // 20% de la apuesta total inicial
const TURN_TIMEOUT = 12000;        // 12 segundos para tirar (humanos)

interface Player {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl: string;
    position: 1 | 2;
    balance: number;     // Saldo en juego (centavos)
    skin: string;
    isBot: boolean;
    connected: boolean;
}

export class DiceRoom {
    public id: string;
    public priceCents: number;
    public stepValue: number;

    // Configuración de tiempos
    public botWaitMs: number;
    public autoLockAt: Date | null;

    public players: Player[] = [];
    public status: 'WAITING' | 'PLAYING' | 'FINISHED' = 'WAITING';

    // Estado de la ronda
    public round: number = 1;
    public turnUserId: string | null = null;
    public rolls: { [userId: string]: [number, number] } = {}; // { "user1": [4, 2] }

    private io: Server;
    private timer: NodeJS.Timeout | null = null;
    private botTimer: NodeJS.Timeout | null = null;

    constructor(roomId: string, priceCents: number, botWaitMs: number, autoLockAt: Date | null, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        // Calculamos cuánto se roba por ronda (20% de la apuesta de UN jugador)
        this.stepValue = Math.floor(this.priceCents * PERCENTAGE_PER_ROUND);
        this.botWaitMs = botWaitMs;
        this.autoLockAt = autoLockAt;
        this.io = io;

        this.initAutoClose();
    }

    // --- GESTIÓN DE JUGADORES ---

    public addPlayer(socket: Socket, user: any, isBot: boolean = false) {
        // 1. Reconexión
        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            existing.connected = true;
            this.emitState();
            return;
        }

        if (this.players.length >= 2 || (this.status !== 'WAITING' && !isBot)) return;

        // 2. Nuevo Jugador
        const position = this.players.some(p => p.position === 1) ? 2 : 1;

        this.players.push({
            socketId: isBot ? 'bot' : socket.id,
            userId: user.id,
            username: user.name || "Jugador",
            avatarUrl: user.avatar || "",
            position,
            balance: this.priceCents, // Empiezan con su apuesta
            skin: user.selectedDiceColor || 'white',
            isBot,
            connected: true
        });

        // Ordenar para consistencia visual (P1 siempre izquierda/arriba)
        this.players.sort((a, b) => a.position - b.position);

        this.emitState();

        // 3. Lógica de Inicio
        if (this.players.length === 1) {
            this.scheduleBot();
        } else if (this.players.length === 2) {
            this.cancelBot();
            setTimeout(() => this.startGame(), 1000); // 1s delay para ver al oponente entrar
        }
    }

    public removePlayer(socketId: string) {
        const p = this.players.find(p => p.socketId === socketId);
        if (!p) return;

        if (this.status === 'WAITING') {
            // Si no ha empezado, se va del todo
            this.players = this.players.filter(pl => pl.socketId !== socketId);
            this.scheduleBot(); // Reiniciar timer de bot si queda solo 1
        } else {
            // Si ya empezó, solo desconectado
            p.connected = false;
        }
        this.emitState();
    }

    // --- LÓGICA DE JUEGO ---

    private startGame() {
        this.status = 'PLAYING';
        this.round = 1;
        this.rolls = {};
        // Empieza el Jugador 1 (Host)
        const p1 = this.players.find(p => p.position === 1);
        this.turnUserId = p1 ? p1.userId : this.players[0].userId;

        this.emitState();
        this.processTurn();
    }

    public handleRoll(userId: string) {
        if (this.status !== 'PLAYING') return;
        if (this.turnUserId !== userId) return;
        if (this.rolls[userId]) return; // Ya tiró

        // Generar Dados
        const d1 = Math.ceil(Math.random() * 6);
        const d2 = Math.ceil(Math.random() * 6);
        this.rolls[userId] = [d1, d2];

        // Emitir Evento de Tiro (Animación)
        this.io.to(this.id).emit('dice_anim', { userId, result: [d1, d2] });

        // Siguiente paso
        this.nextTurnOrResult(userId);
    }

    private nextTurnOrResult(justRolledId: string) {
        // Pausa dramática para ver los dados (1.5s)
        if (this.timer) clearTimeout(this.timer);

        setTimeout(() => {
            const opponent = this.players.find(p => p.userId !== justRolledId);

            if (opponent && !this.rolls[opponent.userId]) {
                // Falta el oponente -> Cambio de Turno
                this.turnUserId = opponent.userId;
                this.emitState();
                this.processTurn();
            } else {
                // Ambos tiraron -> Resultado
                this.resolveRound();
            }
        }, 1200);
    }

    private resolveRound() {
        const p1 = this.players[0];
        const p2 = this.players[1];

        const sum1 = this.rolls[p1.userId][0] + this.rolls[p1.userId][1];
        const sum2 = this.rolls[p2.userId][0] + this.rolls[p2.userId][1];

        let winnerId: string | null = null;

        if (sum1 > sum2) {
            winnerId = p1.userId;
            p1.balance += this.stepValue;
            p2.balance -= this.stepValue;
        } else if (sum2 > sum1) {
            winnerId = p2.userId;
            p2.balance += this.stepValue;
            p1.balance -= this.stepValue;
        }
        // Empate = nadie gana nada

        // Clamp balances
        if (p1.balance < 0) p1.balance = 0;
        if (p2.balance < 0) p2.balance = 0;

        // Emitir Resultado
        this.io.to(this.id).emit('round_result', {
            winnerId,
            rolls: this.rolls,
            balances: { [p1.userId]: p1.balance, [p2.userId]: p2.balance }
        });

        // Check Game Over
        const loser = this.players.find(p => p.balance <= 0);
        if (loser) {
            const winner = this.players.find(p => p.userId !== loser.userId);
            setTimeout(() => this.finishGame(winner!), 2000);
        } else {
            setTimeout(() => this.startNextRound(), 3000);
        }
    }

    private startNextRound() {
        this.round++;
        this.rolls = {};
        // Alternar turno inicial o mantener en P1 (Simplifiquemos: P1 empieza)
        const p1 = this.players.find(p => p.position === 1);
        this.turnUserId = p1?.userId || null;

        this.emitState();
        this.processTurn();
    }

    private async finishGame(winner: Player) {
        this.status = 'FINISHED';
        this.turnUserId = null;
        const totalPot = this.players.reduce((a, b) => a + this.priceCents, 0); // Suma de entradas iniciales

        this.io.to(this.id).emit('game_over', {
            winnerId: winner.userId,
            prize: totalPot
        });

        this.emitState();

        // Persistencia
        try {
            // 1. Guardar resultado
            await prisma.gameResult.create({
                data: {
                    roomId: this.id,
                    winnerUserId: winner.userId,
                    winnerName: winner.username,
                    prizeCents: totalPot,
                    roundNumber: this.round
                }
            });
            // 2. Dar dinero
            await prisma.user.update({
                where: { id: winner.userId },
                data: { balanceCents: { increment: totalPot } }
            });
            // 3. Cerrar sala
            await prisma.room.update({
                where: { id: this.id },
                data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId }
            });
        } catch (e) { console.error("DB Error", e); }
    }

    // --- UTILIDADES ---

    private processTurn() {
        if (this.timer) clearTimeout(this.timer);

        const currentPlayer = this.players.find(p => p.userId === this.turnUserId);
        if (!currentPlayer) return;

        if (currentPlayer.isBot) {
            // Bot tira rápido (1-2s)
            this.timer = setTimeout(() => {
                this.handleRoll(currentPlayer.userId);
            }, Math.random() * 1000 + 1000);
        } else {
            // Humano tiene tiempo límite
            this.timer = setTimeout(() => {
                // Auto-roll si se duerme
                this.handleRoll(currentPlayer.userId);
            }, TURN_TIMEOUT);
        }
    }

    private scheduleBot() {
        if (this.botTimer) clearTimeout(this.botTimer);
        if (this.botWaitMs > 0 && this.players.length === 1) {
            this.botTimer = setTimeout(() => {
                this.injectBot();
            }, this.botWaitMs);
        }
    }

    private cancelBot() {
        if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    }

    private async injectBot() {
        try {
            const bot = await prisma.user.findFirst({ where: { isBot: true } });
            if (bot) {
                this.addPlayer({ id: 'bot-sock' } as any, { // Mock socket
                    id: bot.id,
                    name: bot.name || 'Bot',
                    avatar: bot.avatarUrl,
                    selectedDiceColor: bot.selectedDiceColor
                }, true);
            }
        } catch (e) { }
    }

    private initAutoClose() {
        // Lógica opcional para cerrar sala vacía
        if (this.autoLockAt) {
            const diff = this.autoLockAt.getTime() - Date.now();
            setTimeout(() => {
                if (this.status === 'WAITING' && this.players.length < 2) {
                    this.io.to(this.id).emit('room_closed');
                    // update db...
                }
            }, diff);
        }
    }

    private emitState() {
        this.io.to(this.id).emit('update_game', {
            status: this.status,
            round: this.round,
            turnUserId: this.turnUserId,
            rolls: this.rolls,
            players: this.players.map(p => ({
                userId: p.userId,
                name: p.username,
                avatar: p.avatarUrl,
                balance: p.balance,
                position: p.position,
                isBot: p.isBot,
                skin: p.skin,
                connected: p.connected
            }))
        });
    }
}
