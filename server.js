const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { 
    joinAvailableRoom, 
    removePlayer, 
    updateLap, 
    completeLap, 
    MAX_PLAYERS,
    MAX_LAPS 
} = require("./room");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);
    
    socket.on("joinRace", (playerData) => {
        const room = joinAvailableRoom(socket.id, playerData);
        socket.join(room.id);
        io.to(room.id).emit("roomUpdate", room);
        
        if (room.players.length === MAX_PLAYERS) {
            room.raceStarted = true;
            io.to(room.id).emit("startRace", room);
        }
    });
    
    socket.on("playerMove", (data) => {
        socket.to(data.roomId).emit("playerMoved", {
            id: socket.id,
            x: data.x,
            y: data.y,
            velocityX: data.velocityX,
            velocityY: data.velocityY,
            rotation: data.rotation
        });
    });
    
    // NEW: Handle checkpoint crossing
    socket.on("checkpointPassed", (data) => {
        const result = updateLap(socket.id, data.roomId, data.checkpointId);
        if (result) {
            console.log(`Player ${socket.id} passed checkpoint ${data.checkpointId}`);
        }
    });
    
    // NEW: Handle lap completion
    socket.on("lapCompleted", (data) => {
        const result = completeLap(socket.id, data.roomId, data.totalCheckpoints);
        if (result) {
            const { room, player, raceFinished } = result;
            
            // Broadcast lap update to all players in room
            io.to(data.roomId).emit("playerLapUpdate", {
                playerId: socket.id,
                playerName: player.name,
                currentLap: player.currentLap,
                maxLaps: room.maxLaps,
                finished: player.finished
            });
            
            // If player finished the race
            if (raceFinished) {
                io.to(data.roomId).emit("playerFinishedRace", {
                    playerId: socket.id,
                    playerName: player.name,
                    position: player.finishPosition,
                    finishOrder: room.finishOrder,
                    raceFinished: room.raceFinished
                });
            }
        }
    });
    
    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        const room = removePlayer(socket.id);
        if (room) {
            io.to(room.id).emit("roomUpdate", room);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});