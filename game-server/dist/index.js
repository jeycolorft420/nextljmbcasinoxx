"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const RoomManager_1 = require("./RoomManager");
dotenv_1.default.config();
const PORT = 3001; // Running on 3001 to avoid conflict with Next.js (3000)
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*", // Allow all for now, lock down in prod
        methods: ["GET", "POST"]
    }
});
const roomManager = new RoomManager_1.RoomManager(io);
io.on("connection", (socket) => {
    const { userId, roomId, autoJoin } = socket.handshake.query;
    console.log(`[Socket] New connection: ${socket.id} (User: ${userId}, Room: ${roomId})`);
    if (roomId && typeof roomId === "string") {
        socket.join(roomId);
        // If client requests auto-join (e.g. re-connection)
        if (userId && typeof userId === "string" && autoJoin === "true") {
            roomManager.handleJoin(socket, roomId, userId);
        }
    }
    socket.on("join_room", async ({ roomId, userId }) => {
        await roomManager.handleJoin(socket, roomId, userId);
    });
    socket.on("roll", ({ roomId, userId }) => {
        roomManager.handleRoll(roomId, userId);
    });
    socket.on("disconnect", () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);
        // Handle cleanup if necessary, though persistent state might prefer keeping them for a bit
    });
});
httpServer.listen(PORT, () => {
    console.log(`🚀 Game Server running on port ${PORT}`);
});
