const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const cors   = require("cors");

const {
    joinAvailableRoom,
    removePlayer,
    updateLap,
    completeLap,
    fillWithNPCs,
    MAX_PLAYERS,
    REAL_MAX_PLAYERS,
} = require("./room");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    // ── Join room ──────────────────────────────────────────────────────────
    socket.on("joinRace", (playerData) => {
        const room = joinAvailableRoom(socket.id, playerData);
        socket.join(room.id);
        // Broadcast updated room so all clients can show current player count
        io.to(room.id).emit("roomUpdate", room);

        // Auto-start if all REAL player slots are full (classic 4-player mode)
        const realCount = room.players.filter(p => !p.isNPC).length;
        if (realCount === REAL_MAX_PLAYERS) {
            room.raceStarted = true;
            io.to(room.id).emit("startRace", room);
        }
    });

    // ── Host clicks RACE — fill remaining slots with NPCs and start ────────
    socket.on("startWithNPCs", (data) => {
        const room = fillWithNPCs(data.roomId);
        if (!room) return;
        console.log(`Room ${data.roomId} starting with ${room.players.filter(p => p.isNPC).length} NPCs`);
        io.to(data.roomId).emit("startRace", room);
    });

    // ── Player movement relay ──────────────────────────────────────────────
    socket.on("playerMove", (data) => {
        socket.to(data.roomId).emit("playerMoved", {
            id:        socket.id,
            x:         data.x,
            y:         data.y,
            velocityX: data.velocityX,
            velocityY: data.velocityY,
            rotation:  data.rotation,
        });
    });

    // ── NPC movement relay (host → everyone else) ──────────────────────────
    socket.on("npcMove", (data) => {
        socket.to(data.roomId).emit("playerMoved", {
            id:        data.npcId,   // non-host clients treat this like any remote player
            x:         data.x,
            y:         data.y,
            velocityX: data.velocityX,
            velocityY: data.velocityY,
            rotation:  data.rotation,
        });
    });

    // ── Checkpoint tracking ────────────────────────────────────────────────
    socket.on("checkpointPassed", (data) => {
        const result = updateLap(socket.id, data.roomId, data.checkpointId);
        if (result) {
            console.log(`Player ${socket.id} passed checkpoint ${data.checkpointId}`);
        }
    });

    socket.on("npcCheckpointPassed", (data) => {
        const result = updateLap(socket.id, data.roomId, data.checkpointId, data.npcId);
        if (result) {
            console.log(`NPC ${data.npcId} passed checkpoint ${data.checkpointId}`);
        }
    });

    // ── Lap completion ─────────────────────────────────────────────────────
    socket.on("lapCompleted", (data) => {
        const result = completeLap(socket.id, data.roomId, data.totalCheckpoints);
        if (!result) return;

        const { room, player, raceFinished } = result;
        io.to(data.roomId).emit("playerLapUpdate", {
            playerId:   socket.id,
            playerName: player.name,
            currentLap: player.currentLap,
            maxLaps:    room.maxLaps,
            finished:   player.finished,
        });

        if (raceFinished) {
            io.to(data.roomId).emit("playerFinishedRace", {
                playerId:    socket.id,
                playerName:  player.name,
                position:    player.finishPosition,
                finishOrder: room.finishOrder,
                raceFinished: room.raceFinished,
            });
        }
    });

    socket.on("npcLapCompleted", (data) => {
        const result = completeLap(socket.id, data.roomId, data.totalCheckpoints, data.npcId);
        if (!result) return;

        const { room, player, raceFinished } = result;
        io.to(data.roomId).emit("playerLapUpdate", {
            playerId:   data.npcId,
            playerName: player.name,
            currentLap: player.currentLap,
            maxLaps:    room.maxLaps,
            finished:   player.finished,
            isNPC:      true,
        });

        if (raceFinished) {
            io.to(data.roomId).emit("playerFinishedRace", {
                playerId:    data.npcId,
                playerName:  player.name,
                position:    player.finishPosition,
                finishOrder: room.finishOrder,
                raceFinished: room.raceFinished,
                isNPC:       true,
            });
        }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        const room = removePlayer(socket.id);
        if (room) {
            io.to(room.id).emit("roomUpdate", room);
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));