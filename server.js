const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Room storage: rooms[code] = { players: [], gameState: {} }
const rooms = {};

// Helper to generate a 4-digit room code
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper to find room by code
function getRoomByCode(code) {
    return rooms[code] || null;
}

// Broadcast message to all players in a room
function broadcastToRoom(code, message) {
    const room = getRoomByCode(code);
    if (room) {
        room.players.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        });
    }
}

function getRoomPlayerIds(room) {
    return room.players.map((playerSocket) => playerSocket.playerId).filter(Boolean);
}

function getNextPlayerId(room) {
    const usedIds = new Set(getRoomPlayerIds(room));
    for (let id = 1; id <= 4; id += 1) {
        if (!usedIds.has(id)) {
            return id;
        }
    }
    return null;
}

function removePlayerFromRoom(ws, reason = 'disconnected') {
    const roomCode = ws.playerRoomCode;
    const leavingPlayerId = ws.playerId;

    if (!roomCode) {
        return;
    }

    const room = getRoomByCode(roomCode);
    if (!room) {
        ws.playerRoomCode = null;
        ws.playerId = null;
        return;
    }

    room.players = room.players.filter((playerSocket) => playerSocket !== ws);
    ws.playerRoomCode = null;
    ws.playerId = null;

    if (room.players.length === 0) {
        delete rooms[roomCode];
        console.log(`Room ${roomCode} deleted (empty)`);
        return;
    }

    if (room.host === ws) {
        room.host = room.players[0];
    }

    const remainingPlayerIds = getRoomPlayerIds(room);
    const defaultWinnerId = remainingPlayerIds.length === 1 ? remainingPlayerIds[0] : null;

    broadcastToRoom(roomCode, {
        type: 'PLAYER_DISCONNECTED',
        playerId: leavingPlayerId,
        reason,
        remainingPlayers: room.players.length,
        remainingPlayerIds,
        defaultWinnerId,
        newHostId: room.host ? room.host.playerId : null
    });

    console.log(`Player ${leavingPlayerId} ${reason} from room ${roomCode}`);
}

wss.on('connection', (ws) => {
    let playerRoomCode = null;
    let playerId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            // CREATE ROOM - Player 1 requests to create a room
            if (message.type === 'CREATE_ROOM') {
                const roomCode = generateRoomCode();
                rooms[roomCode] = {
                    players: [ws],
                    gameState: {},
                    host: ws
                };
                playerRoomCode = roomCode;
                playerId = 1;
                ws.playerRoomCode = roomCode;
                ws.playerId = playerId;
                ws.send(JSON.stringify({
                    type: 'ROOM_CREATED',
                    roomCode: roomCode,
                    playerId: playerId
                }));
                console.log(`Room created: ${roomCode}`);
            }

            // JOIN ROOM - Other players request to join
            else if (message.type === 'JOIN_ROOM') {
                const roomCode = message.roomCode;
                const room = getRoomByCode(roomCode);

                if (!room) {
                    ws.send(JSON.stringify({
                        type: 'JOIN_FAILED',
                        reason: 'Room does not exist'
                    }));
                } else if (room.players.length >= 4) {
                    ws.send(JSON.stringify({
                        type: 'JOIN_FAILED',
                        reason: 'Room is full'
                    }));
                } else {
                    // Add player to room
                    playerId = getNextPlayerId(room);
                    if (!playerId) {
                        ws.send(JSON.stringify({
                            type: 'JOIN_FAILED',
                            reason: 'Room is full'
                        }));
                        return;
                    }
                    room.players.push(ws);
                    playerRoomCode = roomCode;
                    ws.playerRoomCode = roomCode;
                    ws.playerId = playerId;

                    // Notify joining player
                    ws.send(JSON.stringify({
                        type: 'ROOM_JOINED',
                        roomCode: roomCode,
                        playerId: playerId,
                        totalPlayers: room.players.length,
                        playerIds: getRoomPlayerIds(room)
                    }));

                    // Notify all players in room of new player
                    broadcastToRoom(roomCode, {
                        type: 'PLAYER_JOINED',
                        playerId: playerId,
                        totalPlayers: room.players.length,
                        playerIds: getRoomPlayerIds(room)
                    });
                    console.log(`Player ${playerId} joined room ${roomCode}`);
                }
            }

            // START GAME - Host signals game start
            else if (message.type === 'START_GAME') {
                if (playerRoomCode) {
                    broadcastToRoom(playerRoomCode, {
                        type: 'GAME_STARTED',
                        roomCode: playerRoomCode,
                        playerIds: getRoomPlayerIds(getRoomByCode(playerRoomCode))
                    });
                    console.log(`Game started in room ${playerRoomCode}`);
                }
            }

            else if (message.type === 'LEAVE_ROOM') {
                removePlayerFromRoom(ws, 'left');
            }

            // SYNC GAME STATE - Any player sends game update
            else if (message.type === 'SYNC_STATE') {
                if (playerRoomCode) {
                    // Broadcast game state to all players in the room
                    broadcastToRoom(playerRoomCode, {
                        type: 'STATE_UPDATE',
                        gameState: message.gameState,
                        fromPlayerId: playerId
                    });
                }
            }

            // PLAYER ACTION - Roll, move, answer trivia, etc.
            else if (message.type === 'PLAYER_ACTION') {
                if (playerRoomCode) {
                    broadcastToRoom(playerRoomCode, {
                        type: 'PLAYER_ACTION',
                        playerId: playerId,
                        action: message.action,
                        data: message.data
                    });
                }
            }

        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        removePlayerFromRoom(ws, 'disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Crown Quest Multiplayer Server running on port ${PORT}`);
    console.log(`Server is listening on all interfaces (0.0.0.0:${PORT})`);
});
