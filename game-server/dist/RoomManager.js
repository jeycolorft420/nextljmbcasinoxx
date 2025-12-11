"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const DiceDuel_1 = require("./games/DiceDuel");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class RoomManager {
    constructor(io) {
        this.games = new Map();
        this.io = io;
        // Clean up stale games interval?
    }
    async getGame(roomId) {
        if (!this.games.has(roomId)) {
            // Load from DB if exists or create new
            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: { entries: { include: { user: true } } }
            });
            if (!room)
                return null;
            const game = new DiceDuel_1.DiceDuelGame(roomId, this.io, prisma, room);
            this.games.set(roomId, game);
            return game;
        }
        return this.games.get(roomId);
    }
    async handleJoin(socket, roomId, userId) {
        const game = await this.getGame(roomId);
        if (!game)
            return; // Room not found
        // Verify user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return;
        socket.join(roomId);
        await game.addPlayer(user);
        this.emitState(roomId);
    }
    async handleRoll(roomId, userId) {
        const game = await this.getGame(roomId);
        if (game) {
            await game.handleRoll(userId);
        }
    }
    emitState(roomId) {
        const game = this.games.get(roomId);
        if (game) {
            this.io.to(roomId).emit("game_state", game.getState());
        }
    }
}
exports.RoomManager = RoomManager;
