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
    public totalDurationSeconds: number;
    public botFillDurationMs: number;
    private botTimer: NodeJS.Timeout | null = null;

    // Almacenamos jugadores en memoria para velocidad
    public players: any[] = [];
    private io: Server;
    private timer: NodeJS.Timeout | null = null;

    constructor(roomId: string, priceCents: number, capacity: number, autoLockAt: Date | null, durationSeconds: number, botFillDurationMs: number, io: Server) {
        this.id = roomId;
        this.priceCents = priceCents;
        this.capacity = capacity;
        this.autoLockAt = autoLockAt;
        this.totalDurationSeconds = durationSeconds;
        this.botFillDurationMs = botFillDurationMs;
        this.io = io;

        // Si la sala reinicia y tiene fecha, reprogramamos todo.
        // Si no tiene fecha (null), iniciamos ciclo si está OPEN.
        if (this.status === 'OPEN') {
            if (this.autoLockAt && this.autoLockAt.getTime() > Date.now()) {
                this.scheduleTimers();
            } else if (!this.autoLockAt) {
                this.startCycle();
            }
        }
    }

    public async addPlayer(socket: Socket, user: any, isBot: boolean = false, isBuyAttempt: boolean = false, requestedPositions: number[] = [], count: number = 1) {
        // --- 1. RECOVERY / REJOIN LOGIC (Existing) ---
        // Buscar todas las entries de este usuario en memoria
        const existingEntries = this.players.filter(p => p.userId === user.id);

        if (existingEntries.length > 0) {
            // Usuario ya está en memoria. Actualizar socketId de TODAS sus entries.
            existingEntries.forEach(p => {
                if (!isBot) p.socketId = socket.id;
            });

            // Si NO es intento de compra explícito, terminamos aquí (limerencia de estado).
            // Si es intento de compra (isBuyAttempt=true), permitimos pasar al bloque de compra para comprar MÁS.
            if (!isBuyAttempt) {
                // Emit state solo a este socket para que se sincronice
                this.emitStateToSocket(socket);
                return;
            }
        } else {
            // No está en memoria. Verificar si tiene entries en DB (Recuperación tras reinicio)
            // Solo si NO es bot (los bots no persisten igual en reinicio salvo que queramos)
            if (!isBot) {
                try {
                    const dbEntries = await prisma.entry.findMany({ where: { roomId: this.id, userId: user.id } });
                    if (dbEntries.length > 0) {
                        // Recuperar estado desde DB
                        let recoveredCount = 0;
                        dbEntries.forEach(dbEntry => {
                            // Verificar que no esté ya ocupado en memoria por algun error
                            if (!this.players.some(p => p.position === dbEntry.position)) {
                                this.players.push({
                                    socketId: socket.id,
                                    userId: user.id,
                                    username: user.name || "Jugador",
                                    avatarUrl: user.avatar || "",
                                    position: dbEntry.position,
                                    isBot: false
                                });
                                recoveredCount++;
                            }
                        });

                        if (recoveredCount > 0) { this.notifyLobby(); this.broadcastState(); }

                        // Si no es compra explicita, terminamos
                        if (!isBuyAttempt) { this.emitStateToSocket(socket); return; }
                    }
                } catch (e) { console.error("Error recover entries:", e); }
            }
        }

        // --- 2. BUY LOGIC ---
        if (this.status !== 'OPEN' && !isBot) {
            socket.emit('error_msg', { message: 'La ronda ya comenzó' });
            return;
        }

        if (!isBuyAttempt && !isBot) return; // Si solo entró a mirar y no tenía entries previas

        // MAX SEATS CHECK (Regla 1: Max 9 puestos por usuario)
        const currentTaken = this.players.length;
        const entriesToCreate = requestedPositions.length > 0 ? requestedPositions.length : count;
        const userCurrentSeats = this.players.filter(p => p.userId === user.id).length;

        if (!isBot && (userCurrentSeats + entriesToCreate > 9)) {
            socket.emit('error_msg', { message: 'Máximo 9 puestos por usuario.' });
            return;
        }

        if (currentTaken + entriesToCreate > this.capacity) {
            if (!isBot) socket.emit('error_msg', { message: 'No hay suficientes puestos' });
            return;
        }

        const positionsToBook: number[] = [];
        const takenPositions = new Set(this.players.map(p => p.position));

        if (requestedPositions.length > 0) {
            for (const p of requestedPositions) {
                if (takenPositions.has(p)) {
                    if (!isBot) socket.emit('error_msg', { message: `El puesto ${p} ya está ocupado` });
                    return;
                }
                positionsToBook.push(p);
            }
        } else {
            let assigned = 0;
            for (let i = 1; i <= this.capacity && assigned < entriesToCreate; i++) {
                if (!takenPositions.has(i)) {
                    positionsToBook.push(i);
                    assigned++;
                }
            }
        }

        if (positionsToBook.length === 0) return;

        // EXECUTE TRANSACTION
        const totalCost = this.priceCents * positionsToBook.length;
        try {
            if (!isBot && isBuyAttempt) {
                const userDb = await prisma.user.findUnique({ where: { id: user.id } });
                if (!userDb || userDb.balanceCents < totalCost) {
                    socket.emit('error_msg', { message: 'Saldo insuficiente' });
                    return;
                }
                await prisma.$transaction([
                    prisma.user.update({ where: { id: user.id }, data: { balanceCents: { decrement: totalCost } } }),
                    prisma.entry.createMany({
                        data: positionsToBook.map(pos => ({ roomId: this.id, userId: user.id, position: pos }))
                    })
                ]);
            } else if (isBot) {
                await prisma.entry.createMany({
                    data: positionsToBook.map(pos => ({ roomId: this.id, userId: user.id, position: pos }))
                });
                BotRegistry.add(user.id);
            }
        } catch (e) {
            console.error("Error Buy Roulette:", e);
            if (!isBot) socket.emit('error_msg', { message: 'Error procesando compra' });
            return;
        }

        // UPDATE MEMORY
        positionsToBook.forEach(pos => {
            this.players.push({
                socketId: isBot ? 'bot' : socket.id,
                userId: user.id,
                username: user.name || "Jugador",
                avatarUrl: user.avatar || "",
                position: pos,
                isBot,
            });
        });

        this.notifyLobby();
        this.broadcastState();

        // AUTO-SPIN CHECK (Regla 4: Girar si se llena)
        if (this.players.length >= this.capacity) {
            this.spin();
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

    // --- GAME LOOP & BOT LOGIC ---

    private startCycle() {
        console.log(`[Roulette ${this.id}] Starting Cycle. Duration: ${this.totalDurationSeconds}s`);
        // Regla: Duración total (Time 1)
        const durationMs = this.totalDurationSeconds * 1000;
        this.autoLockAt = new Date(Date.now() + durationMs);

        // Actualizar DB
        prisma.room.update({ where: { id: this.id }, data: { autoLockAt: this.autoLockAt } })
            .then(() => {
                this.notifyLobby();
                this.scheduleTimers();
            })
            .catch(console.error);
    }

    private scheduleTimers() {
        if (!this.autoLockAt) return;
        const now = Date.now();
        const lockTime = this.autoLockAt.getTime();
        const timeRemaining = lockTime - now;

        if (timeRemaining <= 0) {
            this.spin();
            return;
        }

        // 1. Timer de Giro (Hard Lock)
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.spin(), timeRemaining);

        // 2. Timer de Bots (Time 2: Fill Phase)
        if (this.botTimer) clearTimeout(this.botTimer); // Clear any existing bot timer
        // Bot Phase Starts at: LockTime - FillDuration
        // Example: Lock at 12:20. FillDuration 5m. Start bots at 12:15.
        // If Now is 12:10, wait 5m. If Now is 12:16, start immediately.

        const botStartTime = lockTime - this.botFillDurationMs;
        const timeUntilBots = botStartTime - now;

        if (timeUntilBots > 0) {
            // Wait until phase starts
            this.botTimer = setTimeout(() => this.startBotFill(), timeUntilBots);
        } else {
            // Already in fill phase, start filling immediately logic
            this.startBotFill();
        }
    }

    private startBotFill() {
        // Logica recursiva para llenar:
        // Calcular cuantos faltan y cuanto tiempo queda.
        // Programar siguiente bot.
        if (this.status !== 'OPEN') return;
        if (!this.autoLockAt) return;

        const now = Date.now();
        const timeRemaining = this.autoLockAt.getTime() - now;
        const slotsNeeded = this.capacity - this.players.length;

        if (slotsNeeded <= 0) return; // Full
        if (timeRemaining <= 1000) {
            // Panic mode: fill all immediately just before spin
            this.fillWithBots(slotsNeeded);
            return;
        }

        // Distribuir bots en el tiempo restante
        // Interval = TimeRemaining / SlotsNeeded
        // Pero añadimos algo de aleatoriedad
        const interval = timeRemaining / slotsNeeded;
        // Schedule next bot
        this.botTimer = setTimeout(() => {
            this.addBot();
            this.startBotFill(); // Recurse
        }, interval * 0.9); // 90% del intervalo para asegurar que den todos
    }

    private async addBot() {
        if (this.status !== 'OPEN') return;
        if (this.players.length >= this.capacity) return;

        const botUser = await BotRegistry.getBot();
        // Bot buys 1 seat
        await this.addPlayer(null as any, { id: botUser.id, name: botUser.name, avatar: botUser.avatar }, true, true, [], 1);
    }

    private async fillWithBots(count: number) {
        for (let i = 0; i < count; i++) {
            await this.addBot();
        }
    }

    // --- GAME CONTROL ---

    private scheduleSpin() {
        // Legacy wrapper, now logic is in scheduleTimers
    }
    private shortenTimer() {
        // Legacy: Auto-spin check is now instant in addPlayer
    }
    private startCountdown() {
        // Legacy: Using fixed startCycle now
    }

    private async spin() {
        if (this.status !== 'OPEN') return; // Prevent double spin
        if (this.players.length === 0) {
            this.reset();
            return;
        }

        this.status = 'LOCKED';
        if (this.timer) clearTimeout(this.timer);
        if (this.botTimer) clearTimeout(this.botTimer);

        this.notifyLobby();

        const winnerIndex = Math.floor(Math.random() * this.players.length);
        const winner = this.players[winnerIndex];

        // Result Animation
        this.io.to(this.id).emit('spin_wheel', {
            winnerId: winner.userId,
            winnerPosition: winner.position
        });

        // Regla 2: Payout Calculation (10x price)
        const prize = this.priceCents * 10;

        // Wait animation
        setTimeout(() => this.finishGame(winner, prize), 8000);
    }

    private async finishGame(winner: any, prize: number) {
        this.status = 'FINISHED';

        try {
            await prisma.$transaction([
                prisma.user.update({ where: { id: winner.userId }, data: { balanceCents: { increment: prize } } }),
                prisma.gameResult.create({
                    data: {
                        roomId: this.id,
                        winnerUserId: winner.userId,
                        winnerName: winner.username,
                        prizeCents: prize,
                        roundNumber: 1
                    }
                }),
                prisma.room.update({
                    where: { id: this.id },
                    data: { state: 'FINISHED', finishedAt: new Date(), winningEntryId: winner.userId }
                })
            ]);
        } catch (e) { console.error("Error finishGame Roulette:", e); }

        this.io.to(this.id).emit('game_over', { winnerId: winner.userId, prize });
        this.notifyLobby();

        // Regla 5: Auto-Loop immediately (wait 10s then reset)
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
            await prisma.room.update({ where: { id: this.id }, data: { state: 'OPEN', autoLockAt: null, finishedAt: null, winningEntryId: null } });
        } catch (e) { console.error(e); }

        this.notifyLobby();
        this.io.to(this.id).emit('server:room:reset');

        // RESTART CYCLE
        this.startCycle();
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
