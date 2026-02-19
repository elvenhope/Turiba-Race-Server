const MAX_PLAYERS      = 4;
const REAL_MAX_PLAYERS = MAX_PLAYERS;

const SPAWN_POINTS = [
    { x: 1423, y: 244 },
    { x: 1423, y: 320 },
    { x: 1304, y: 244 },
    { x: 1304, y: 320 },
    { x: 1200, y: 244 },
];

// Full character roster — matches CharScene exactly
const ALL_CHARACTERS = [
    "TOURISM AND HOSPITALITY",
    "INFORMATION TECHNOLOGIES",
    "LAW SCIENCE",
    "BUSINESS ADMINISTRATION",
    "COMMUNICATION SCIENCE",
    "HEALTHCARE",
    "ORGANIZATION MANAGEMENT",
];

// Fisher-Yates shuffle — returns a new shuffled array, doesn't mutate original
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

let rooms = [];

function createRoom() {
    const newRoom = {
        id:           "room_" + Date.now(),
        players:      [],
        finishOrder:  [],
        raceStarted:  false,
        raceFinished: false,
        maxLaps:      3,
    };
    rooms.push(newRoom);
    return newRoom;
}

function fillWithNPCs(roomId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.raceStarted) return null;

    const realPlayers = room.players.filter(p => !p.isNPC);
    const slotsNeeded = MAX_PLAYERS - realPlayers.length;

    // Exclude characters already chosen by real players, then shuffle what's left
    const takenNames = new Set(realPlayers.map(p => p.name));
    const available  = shuffle(ALL_CHARACTERS.filter(n => !takenNames.has(n)));

    for (let i = 0; i < slotsNeeded; i++) {
        const spawnIndex = realPlayers.length + i;
        const spawn      = SPAWN_POINTS[spawnIndex] || SPAWN_POINTS[SPAWN_POINTS.length - 1];
        const npcName    = available[i % available.length];

        room.players.push({
            id:                `npc_${i}`,
            name:              npcName,
            character:         npcName,
            spawnX:            spawn.x,
            spawnY:            spawn.y,
            isNPC:             true,
            finished:          false,
            finishPosition:    null,
            currentLap:        0,
            checkpointsPassed: [],
        });
    }

    room.raceStarted = true;
    return room;
}

function joinAvailableRoom(socketId, playerData) {
    let room = rooms.find(r =>
        r.players.filter(p => !p.isNPC).length < REAL_MAX_PLAYERS && !r.raceStarted
    );
    if (!room) room = createRoom();

    const realCount  = room.players.filter(p => !p.isNPC).length;
    const spawnIndex = realCount;
    const spawn      = SPAWN_POINTS[spawnIndex] || SPAWN_POINTS[0];

    room.players.push({
        id:                socketId,
        name:              playerData.name,
        character:         playerData.character,
        spawnX:            spawn.x,
        spawnY:            spawn.y,
        isNPC:             false,
        finished:          false,
        finishPosition:    null,
        currentLap:        0,
        checkpointsPassed: [],
    });

    return room;
}

function updateLap(socketId, roomId, checkpointId, npcId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return null;

    const targetId = npcId || socketId;
    const player   = room.players.find(p => p.id === targetId);
    if (!player || player.finished) return null;

    if (!player.checkpointsPassed.includes(checkpointId)) {
        player.checkpointsPassed.push(checkpointId);
    }
    return { room, player };
}

function completeLap(socketId, roomId, totalCheckpoints, npcId) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return null;

    const targetId = npcId || socketId;
    const player   = room.players.find(p => p.id === targetId);
    if (!player || player.finished) return null;

    if (player.checkpointsPassed.length < totalCheckpoints) {
        console.log(`${targetId} tried to finish lap without all checkpoints: ${player.checkpointsPassed.length}/${totalCheckpoints}`);
        return null;
    }

    player.currentLap++;
    player.checkpointsPassed = [];
    console.log(`${targetId} completed lap ${player.currentLap}/${room.maxLaps}`);

    if (player.currentLap >= room.maxLaps) {
        player.finished       = true;
        player.finishPosition = room.finishOrder.length + 1;
        room.finishOrder.push({
            id:        targetId,
            name:      player.name,
            position:  player.finishPosition,
            timestamp: Date.now(),
            isNPC:     player.isNPC || false,
        });

        if (room.finishOrder.length === room.players.length) {
            room.raceFinished = true;
        }

        return { room, player, raceFinished: true };
    }

    return { room, player, raceFinished: false };
}

function removePlayer(socketId) {
    if (socketId.startsWith("npc_")) return null;

    for (let room of rooms) {
        const index = room.players.findIndex(p => p.id === socketId);
        if (index !== -1) {
            room.players.splice(index, 1);
            if (room.players.filter(p => !p.isNPC).length === 0) {
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
    fillWithNPCs,
    MAX_PLAYERS,
    REAL_MAX_PLAYERS,
};