"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiceDuelGame = void 0;
const crypto_1 = __importDefault(require("crypto"));
class DiceDuelGame {
    constructor(roomId, io, prisma, initialRoomData) {
        this.roomId = roomId;
        this.io = io;
        this.prisma = prisma;
        this.state = {
            roomId,
            state: initialRoomData.state === "OPEN" || initialRoomData.state === "LOCKED" ? "OPEN" : "FINISHED",
            currentRound: initialRoomData.currentRound || 1,
            players: [],
            rolls: {},
            lastDice: initialRoomData.gameMeta?.lastDice || {},
            roundStartedAt: 0,
            history: initialRoomData.gameMeta?.history || [],
            priceCents: initialRoomData.priceCents
        };
        if (initialRoomData.entries) {
            initialRoomData.entries.forEach((e) => {
                this.addPlayerToState({
                    id: e.user.id,
                    name: e.user.name,
                    isBot: e.user.isBot,
                    balance: initialRoomData.gameMeta?.balances?.[e.user.id] ?? initialRoomData.priceCents,
                    position: e.position,
                    color: e.user.selectedDiceColor,
                    connected: true,
                });
            });
        }
        // Start Loop
        setInterval(() => this.tick(), 1000);
    }
    getState() {
        return this.state;
    }
    broadcast() {
        this.io.to(this.roomId).emit("game_state", this.state);
    }
    addPlayerToState(p) {
        if (!this.state.players.find(x => x.id === p.id)) {
            this.state.players.push({ ...p, connected: true });
            this.state.players.sort((a, b) => a.position - b.position);
        }
    }
    async addPlayer(user) {
        const existing = this.state.players.find(p => p.id === user.id);
        if (existing) {
            existing.connected = true;
            this.broadcast();
            return;
        }
        if (this.state.players.length >= 2)
            return;
        const pos1 = this.state.players.find(p => p.position === 1);
        const position = pos1 ? 2 : 1;
        try {
            await this.prisma.entry.create({
                data: {
                    roomId: this.roomId,
                    userId: user.id,
                    position,
                    round: this.state.currentRound
                }
            });
        }
        catch (e) { }
        // Initial Balance = Room Price
        const newPlayer = {
            id: user.id,
            name: user.name || "Player",
            isBot: user.isBot,
            balance: this.state.priceCents,
            position,
            color: user.selectedDiceColor || "white",
            connected: true
        };
        this.state.players.push(newPlayer);
        this.state.players.sort((a, b) => a.position - b.position);
        this.checkForStart();
        this.broadcast();
    }
    checkForStart() {
        if (this.state.players.length === 2 && this.state.state === "OPEN") {
            this.state.state = "LOCKED";
            this.state.roundStartedAt = Date.now();
            this.broadcast();
            // Persist Lock
            this.prisma.room.update({
                where: { id: this.roomId },
                data: { state: "LOCKED" }
            }).catch(console.error);
        }
    }
    async handleRoll(userId) {
        if (this.state.state !== "LOCKED")
            return;
        const player = this.state.players.find(p => p.id === userId);
        if (!player)
            return;
        if (this.state.rolls[userId])
            return;
        // Roll
        const r1 = crypto_1.default.randomInt(1, 7);
        const r2 = crypto_1.default.randomInt(1, 7);
        this.state.rolls[userId] = [r1, r2];
        this.broadcast();
        const p1 = this.state.players.find(p => p.position === 1);
        const p2 = this.state.players.find(p => p.position === 2);
        if (p1 && p2 && this.state.rolls[p1.id] && this.state.rolls[p2.id]) {
            await this.resolveRound(p1, p2);
        }
    }
    async resolveRound(p1, p2) {
        this.state.state = "RESOLVING";
        const roll1 = this.state.rolls[p1.id];
        const roll2 = this.state.rolls[p2.id];
        const sum1 = roll1[0] + roll1[1];
        const sum2 = roll2[0] + roll2[1];
        const damage = Math.max(1, Math.floor(this.state.priceCents * 0.20));
        let winnerId = null;
        if (sum1 > sum2) {
            winnerId = p1.id;
            p2.balance -= damage;
            p1.balance += damage;
        }
        else if (sum2 > sum1) {
            winnerId = p2.id;
            p1.balance -= damage;
            p2.balance += damage;
        }
        // History
        const roundDice = { top: roll1, bottom: roll2 };
        // Map dice correctly to user IDs for frontend if needed? 
        // Frontend expects: dice: { top: [1,2], bottom: [3,4] } roughly mapped to positions
        const historyEntry = {
            rolls: { [p1.id]: roll1, [p2.id]: roll2 },
            dice: roundDice,
            winnerUserId: winnerId,
            damage,
            timestamp: Date.now(),
            round: this.state.currentRound,
            balancesAfter: { [p1.id]: p1.balance, [p2.id]: p2.balance },
            winnerEntryId: winnerId === p1.id ? p1.id : (winnerId === p2.id ? p2.id : null) // We use ID match usually
        };
        this.state.history.push(historyEntry);
        this.state.lastDice = { top: roll1, bottom: roll2 };
        // Check End Game
        if (p1.balance <= 0 || p2.balance <= 0) {
            await this.endGame(p1, p2);
        }
        else {
            // Save state to DB (Intermediate)
            await this.saveIntermediateState();
            this.broadcast();
            // Delay Next Round
            setTimeout(() => this.nextRound(), 4000);
        }
    }
    async saveIntermediateState() {
        const balances = {};
        this.state.players.forEach(p => balances[p.id] = p.balance);
        await this.prisma.room.update({
            where: { id: this.roomId },
            data: {
                currentRound: this.state.currentRound,
                gameMeta: {
                    balances,
                    history: this.state.history,
                    lastDice: this.state.lastDice,
                    rolls: this.state.rolls
                }
            }
        });
    }
    async endGame(p1, p2) {
        this.state.state = "FINISHED";
        const winner = p1.balance > 0 ? p1 : p2;
        this.state.winner = winner;
        this.broadcast();
        const prize = this.state.priceCents * 2;
        await this.prisma.$transaction([
            this.prisma.room.update({
                where: { id: this.roomId },
                data: {
                    state: "FINISHED",
                    finishedAt: new Date(),
                    winningEntryId: winner.id === p1.id ? (await this.getEntryId(p1.id)) : (await this.getEntryId(p2.id)),
                    gameMeta: {
                        balances: { [p1.id]: p1.balance, [p2.id]: p2.balance },
                        history: this.state.history,
                        ended: true
                    }
                }
            }),
            this.prisma.user.update({
                where: { id: winner.id },
                data: { balanceCents: { increment: prize } }
            })
            // Add Transaction log here if needed
        ]);
        console.log(`[Game] Finished Room ${this.roomId}, Winner: ${winner.name}`);
    }
    async getEntryId(userId) {
        const entry = await this.prisma.entry.findFirst({ where: { roomId: this.roomId, userId } });
        return entry?.id;
    }
    nextRound() {
        this.state.currentRound++;
        this.state.rolls = {};
        this.state.state = "LOCKED";
        this.state.roundStartedAt = Date.now();
        this.broadcast();
    }
    async tick() {
        if (this.state.state === "LOCKED") {
            const now = Date.now();
            // Bot Moves
            this.state.players.forEach(p => {
                if (p.isBot && !this.state.rolls[p.id]) {
                    if (now - this.state.roundStartedAt > 2000 && Math.random() > 0.8) {
                        this.handleRoll(p.id);
                    }
                }
            });
            // Timeout Logic (e.g. 30s)
            if (now - this.state.roundStartedAt > 35000) {
                // Auto-roll or Forfeit? Auto-roll for now to keep game moving
                this.state.players.forEach(p => {
                    if (!this.state.rolls[p.id])
                        this.handleRoll(p.id);
                });
            }
        }
        // Auto-Add Bot if 1 player waiting > 5s
        if (this.state.state === "OPEN" && this.state.players.length === 1) {
            // Logic to add bot... needs access to DB to find bot user
            // Simplify: RoomManager handles adding bots? Or specific method here.
        }
    }
}
exports.DiceDuelGame = DiceDuelGame;
