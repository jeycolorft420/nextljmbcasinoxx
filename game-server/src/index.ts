import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { RoomManager } from "./RoomManager";

dotenv.config();

const PORT = 3001; // Running on 3001 to avoid conflict with Next.js (3000)
const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all for now, lock down in prod
        methods: ["GET", "POST"]
    }
});

const roomManager = new RoomManager(io);

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
