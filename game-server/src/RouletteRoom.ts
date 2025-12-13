import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import Pusher from 'pusher';
import { BotRegistry } from './lib/BotRegistry';

const prisma = new PrismaClient();
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true
});

export class RouletteRoom {
    public id: string;
    public priceCents: number;
    public capacity: number;
    public status: 'OPEN' | 'LOCKED' | 'FINISHED' = 'OPEN';
    public autoLockAt: Date | null;

    // Almacenamos jugadores en memoria para velocidad
    public players: any[] = [];
    private io: Server;
    private timer: NodeJS.Timeout | null = null;

    constructor(roomId: string, priceCents: number, capacity: number, autoLockAt: Date | null, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.capacity = capacity;
        this.autoLockAt = autoLockAt;
        this.io = io;

        // Si la sala se reinicia y ya tenía fecha de cierre, programar el giro
        if (this.autoLockAt && this.autoLockAt.getTime() > Date.now()) {
            this.scheduleSpin();
        }
    }

    public async addPlayer(socket: Socket, user: any, isBot: boolean = false, isBuyAttempt: boolean = false) {
        // 1. Validar Capacidad en Memoria
        if (this.players.length >= this.capacity) {
            if (!isBot) socket.emit('error_msg', { message: 'Mesa llena' });
            return;
        }

        const existing = this.players.find(p => p.userId === user.id);
        if (existing) {
            if (!isBot) existing.socketId = socket.id;
            // No hacemos broadcast si ya existe, solo reconectamos
            return;
        }

        if (this.status !== 'OPEN' && !isBot) {
            socket.emit('error_msg', { message: 'La ronda ya comenzó' });
            return;
        }

        // 2. Procesar Compra / Entrada
        let pos = this.getNextFreePosition();

        try {
            // Verificar si ya pagó en DB
            const activeEntry = await prisma.entry.findFirst({ where: { roomId: this.id, userId: user.id } });

            if (activeEntry) {
                pos = activeEntry.position;
            } else {
                if (!isBot && isBuyAttempt) {
                    // Transacción de Cobro
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
                    await prisma.entry.create({ data: { roomId: this.id, userId: user.id, position: pos } });
                    BotRegistry.add(user.id);
                } else {
                    return; // Es un espectador
                }
            }
        } catch (e) {
            console.error(e);
            if (!isBot) socket.emit('error_msg', { message: 'Error en la compra' });
            return;
        }

        // 3. Añadir a Memoria
        const newPlayer = {
            socketId: isBot ? 'bot' : socket.id,
            userId: user.id,
            username: user.name || "Jugador",
            avatarUrl: user.avatar || "",
            position: pos,
            isBot,
        };

        this.players.push(newPlayer);
        this.notifyLobby(); // Actualizar lista de salas
        this.broadcastState(); // Actualizar a los que están dentro

        // 4. Lógica de Inicio (Primer jugador activa el contador si no existe)
        if (this.players.length === 1 && !this.autoLockAt) {
            this.startCountdown();
        }

        // Si se llena, girar pronto
        if (this.players.length >= this.capacity) {
            this.shortenTimer();
        }
    }

    public async removePlayer(socketId: string) {
        // En Ruleta, si ya compraste, NO te sales de la lista de "players" al desconectar
        // porque tu ticket sigue valiendo para el sorteo.
        // Solo quitamos si es estado OPEN y explícitamente se pide reembolso (lógica compleja)
        // Por ahora, solo marcamos desconexión visual si quisiéramos, pero mantenemos en array.

        // Si quisieras permitir salir y reembolso antes del lock:
        /*
        const p = this.players.find(p => p.socketId === socketId);
        if (p && this.status === 'OPEN') {
             // Lógica de reembolso y borrar entry...
             this.notifyLobby();
        }
        */
    }

    // --- LOGICA DEL JUEGO ---

    private startCountdown() {
        // 60 segundos desde el primer jugador
        const seconds = 60;
        this.autoLockAt = new Date(Date.now() + seconds * 1000);

        prisma.room.update({ where: { id: this.id }, data: { autoLockAt: this.autoLockAt } })
            .then(() => {
                this.notifyLobby();
                this.scheduleSpin();
            })
            .catch(console.error);
    }

    private shortenTimer() {
        // Si se llena, reducir tiempo a 10s si faltaba más
        if (!this.autoLockAt) return;
        const remaining = this.autoLockAt.getTime() - Date.now();
        if (remaining > 10000) {
            this.autoLockAt = new Date(Date.now() + 10000);
            prisma.room.update({ where: { id: this.id }, data: { autoLockAt: this.autoLockAt } })
                .then(() => {
                    this.notifyLobby();
                    this.scheduleSpin();
                });
        }
    }

    private scheduleSpin() {
        if (this.timer) clearTimeout(this.timer);
        if (!this.autoLockAt) return;

        const delay = Math.max(0, this.autoLockAt.getTime() - Date.now());
        console.log(`[Roulette ${this.id}] Girando en ${delay / 1000}s`);

        this.timer = setTimeout(() => this.spin(), delay);
    }

    private async spin() {
        if (this.players.length === 0) {
            this.reset();
            return;
        }

        this.status = 'LOCKED';
        this.notifyLobby();

        // Elegir ganador aleatorio
        const winnerIndex = Math.floor(Math.random() * this.players.length);
        const winner = this.players[winnerIndex];

        // Calcular premio total
        const totalPot = this.players.length * this.priceCents;

        // Notificar frontend para animación
        this.io.to(this.id).emit('spin_wheel', {
            winnerId: winner.userId,
            winnerPosition: winner.position
        });

        // Esperar animación (ej: 8 segundos) y finalizar
        setTimeout(() => this.finishGame(winner, totalPot), 8000);
    }

    private async finishGame(winner: any, prize: number) {
        this.status = 'FINISHED';

        try {
            await prisma.$transaction([
                // Pagar al ganador
                prisma.user.update({ where: { id: winner.userId }, data: { balanceCents: { increment: prize } } }),
                // Registrar resultado
                prisma.gameResult.create({
                    data: {
                        roomId: this.id,
                        winnerUserId: winner.userId,
                        winnerName: winner.username,
                        prizeCents: prize,
                        roundNumber: 1 // Ruleta suele ser 1 ronda
                    }
                }),
                // Marcar sala
                prisma.room.update({
                    where: { id: this.id },
                    data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId }
                })
            ]);
        } catch (e) { console.error("Error finishGame Roulette:", e); }

        this.io.to(this.id).emit('game_over', { winnerId: winner.userId, prize });
        this.notifyLobby();

        // Reset automático
        setTimeout(() => this.reset(), 10000);
    }

    public async reset() {
        // Liberar bots
        this.players.forEach(p => {
            if (p.isBot) BotRegistry.remove(p.userId);
        });

        this.players = [];
        this.status = 'OPEN';
        this.autoLockAt = null;

        try {
            await prisma.entry.deleteMany({ where: { roomId: this.id } });
            await prisma.room.update({ where: { id: this.id }, data: { state: 'OPEN', autoLockAt: null, finishedAt: null } });
        } catch (e) { console.error(e); }

        this.notifyLobby();
        this.io.to(this.id).emit('server:room:reset');
    }

    // --- UTILS ---
    private getNextFreePosition(): number {
        const taken = new Set(this.players.map(p => p.position));
        for (let i = 1; i <= this.capacity; i++) {
            if (!taken.has(i)) return i;
        }
        return this.players.length + 1;
    }

    private async notifyLobby() {
        try {
            const taken = this.players.length;
            const payload = {
                id: this.id,
                title: 'Ruleta',
                priceCents: this.priceCents,
                state: this.status,
                capacity: this.capacity,
                gameType: 'ROULETTE',
                slots: { taken, free: this.capacity - taken },
                autoLockAt: this.autoLockAt ? this.autoLockAt.toISOString() : null
            };
            await pusher.trigger("public-rooms", "room:update", payload);
        } catch (e) { }
    }

    // --- HELPERS ---
    private broadcastState() {
        // Enviar estado a todos en la sala principal
        this.io.to(this.id).emit('update_game', {
            status: this.status,
            players: this.players,
            timeLeft: this.autoLockAt ? Math.max(0, (this.autoLockAt.getTime() - Date.now()) / 1000) : 0,
            taken: this.players.length,
            capacity: this.capacity
        });
    }

    public emitStateToSocket(socket: Socket) {
        // Enviar estado inicial a quien conecta
        socket.emit('update_game', {
            status: this.status,
            players: this.players,
            timeLeft: this.autoLockAt ? Math.max(0, (this.autoLockAt.getTime() - Date.now()) / 1000) : 0
        });
    }

    // Métodos vacíos para compatibilidad si index llama genéricamente, 
    // o simplemente no los llamamos desde index.
    public destroy() { if (this.timer) clearTimeout(this.timer); }
}
