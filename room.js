const MAX_PLAYERS = 4;
const MAX_LAPS = 3; // Configure number of laps here

const SPAWN_POINTS = [
    { x: 1423, y: 244 },
    { x: 1423, y: 320 },
    { x: 1304, y: 244 },
    { x: 1304, y: 320 },
    { x: 1200, y: 244 }
];
let rooms = [];

function createRoom() {
    const newRoom = {
        id: "room_" + Date.now(),
        players: [],
        finishOrder: [],
        raceStarted: false,
        raceFinished: false,
        maxLaps: MAX_LAPS
    };
    rooms.push(newRoom);
    return newRoom;
}

function joinAvailableRoom(socketId, playerData) {
    let room = rooms.find(r => r.players.length < MAX_PLAYERS && !r.raceStarted);
    if (!room) {
        room = createRoom();
    }
    const spawnIndex = room.players.length;
    const spawn = SPAWN_POINTS[spawnIndex];
    room.players.push({
        id: socketId,
        name: playerData.name,
        character: playerData.character,
        spawnX: spawn.x,
        spawnY: spawn.y,
        finished: false,
        finishPosition: null,
        currentLap: 0, // NEW
        checkpointsPassed: [] // NEW
    });
    return room;
}

function updateLap(socketId, roomId, checkpointId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return null;
    
    const player = room.players.find(p => p.id === socketId);
    if (!player || player.finished) return null;
    
    // Add checkpoint if not already passed this lap
    if (!player.checkpointsPassed.includes(checkpointId)) {
        player.checkpointsPassed.push(checkpointId);
    }
    
    return { room, player };
}

function completeLap(socketId, roomId, totalCheckpoints) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return null;
    
    const player = room.players.find(p => p.id === socketId);
    if (!player || player.finished) return null;
    
    // Check if all checkpoints were passed
    if (player.checkpointsPassed.length < totalCheckpoints) {
        console.log(`Player ${socketId} tried to finish lap without all checkpoints: ${player.checkpointsPassed.length}/${totalCheckpoints}`);
        return null;
    }
    
    // Increment lap
    player.currentLap++;
    player.checkpointsPassed = []; // Reset checkpoints for next lap
    
    console.log(`Player ${socketId} completed lap ${player.currentLap}/${room.maxLaps}`);
    
    // Check if race is finished
    if (player.currentLap >= room.maxLaps) {
        player.finished = true;
        player.finishPosition = room.finishOrder.length + 1;
        room.finishOrder.push({
            id: socketId,
            name: player.name,
            position: player.finishPosition,
            timestamp: Date.now()
        });
        
        if (room.finishOrder.length === room.players.length) {
            room.raceFinished = true;
        }
        
        return { room, player, raceFinished: true };
    }
    
    return { room, player, raceFinished: false };
}

function removePlayer(socketId) {
    for (let room of rooms) {
        const index = room.players.findIndex(p => p.id === socketId);
        if (index !== -1) {
            room.players.splice(index, 1);
            if (room.players.length === 0) {
                rooms = rooms.filter(r => r.id !== room.id);
            }
            return room;
        }
    }
    return null;
}

module.exports = {
    joinAvailableRoom,
    removePlayer,
    updateLap,
    completeLap,
    MAX_PLAYERS,
    MAX_LAPS
};