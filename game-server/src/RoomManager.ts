import { Server, Socket } from "socket.io";
import { DiceDuelGame } from "./games/DiceDuel";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class RoomManager {
    private games: Map<string, DiceDuelGame> = new Map();
    private io: Server;

    constructor(io: Server) {
        this.io = io;
        // Clean up stale games interval?
    }

    async getGame(roomId: string) {
        if (!this.games.has(roomId)) {
            // Load from DB if exists or create new
            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: { entries: { include: { user: true } } }
            });
            if (!room) return null;

            const game = new DiceDuelGame(roomId, this.io, prisma, room);
            this.games.set(roomId, game);
            return game;
        }
        return this.games.get(roomId);
    }

    async handleJoin(socket: Socket, roomId: string, userId: string) {
        const game = await this.getGame(roomId);
        if (!game) return; // Room not found

        // Verify user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return;

        socket.join(roomId);
        await game.addPlayer(user);
        this.emitState(roomId);
    }

    async handleRoll(roomId: string, userId: string) {
        const game = await this.getGame(roomId);
        if (game) {
            await game.handleRoll(userId);
        }
    }

    emitState(roomId: string) {
        const game = this.games.get(roomId);
        if (game) {
            this.io.to(roomId).emit("game_state", game.getState());
        }
    }
}
