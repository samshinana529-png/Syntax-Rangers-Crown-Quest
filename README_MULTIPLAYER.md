# Crown Quest - Multiplayer Setup Guide

## Overview
Crown Quest now supports **WiFi-based local multiplayer**! Players on the same WiFi network can host a game room, share a room code, and play together on different devices.

## How It Works

1. **Room Creation**: One player (Host) clicks "Multiplayer" → "Create Room" to generate a 4-digit room code
2. **Room Joining**: Other players click "Multiplayer" → "Join Room" and enter the code
3. **Game Sync**: All player actions (rolls, moves, trivia answers) are synchronized in real-time across all devices
4. **Turn Management**: The host device manages turn order, but all players see the same board state

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher) - Download from [nodejs.org](https://nodejs.org/)
- All devices on the same WiFi network
- Know your computer's local IP address

### 1. Install Server Dependencies

Open a terminal/PowerShell in the game folder and run:

```bash
npm install
```

This will install the WebSocket server dependencies.

### 2. Find Your Computer's IP Address

**Windows:**
```powershell
ipconfig
```
Look for "IPv4 Address" under your WiFi adapter (usually `192.168.x.x`)

**Mac/Linux:**
```bash
ifconfig
```

### 3. Start the Multiplayer Server

In the game folder terminal, run:

```bash
npm start
```

You should see:
```
Crown Quest Multiplayer Server running on port 3000
Server is listening on all interfaces (0.0.0.0:3000)
```

**Keep this terminal open while playing!**

### 4. Open the Game on Host Device

Open `index.html` in your browser on the computer running the server.

### 5. Open the Game on Other Devices

On other devices connected to the same WiFi, open:
```
http://YOUR_COMPUTER_IP:8000/index.html
```

Replace `YOUR_COMPUTER_IP` with the IPv4 address you found earlier (e.g., `http://192.168.1.50:8000/index.html`)

**Note:** You may need to serve the HTML files via a simple HTTP server. If not working, try:

```bash
# Using Python (if installed)
python -m http.server 8000

# Or using Node.js
npx http-server -p 8000
```

### 6. Play!

1. Host clicks **Multiplayer** → **Create Room**
2. Share the 4-digit room code with friends
3. Friends click **Multiplayer** → **Join Room** and enter the code
4. Host clicks **Start Game** when all players are ready
5. Play together!

## Troubleshooting

### "Failed to connect to server"
- Make sure the server is running (`npm start`)
- Check that all devices are on the same WiFi network
- Verify the server IP/port in browser console

### Players not seeing each other's moves
- Check network connection
- Ensure no firewall is blocking port 3000
- Restart the server and rejoin

### Port 3000 already in use
- Change the port in `server.js` (line with `const PORT`)
- Or close the app using port 3000

## Network Requirements

- **Same WiFi Network**: Required for local multiplayer
- **Firewall**: Port 3000 must be open for WebSocket connections
- **Router**: Should not restrict local connections

## Features

✅ Create and join game rooms with codes  
✅ Real-time game state synchronization  
✅ Automatic player turn management  
✅ Dice roll sync across all devices  
✅ Trivia question scoring sync  
✅ Automatic disconnect handling  

## File Structure

```
├── index.html          # Game UI with multiplayer menu
├── script.js           # Game logic + multiplayer client code
├── style.css           # Styles including multiplayer UI
├── server.js           # WebSocket multiplayer server
├── package.json        # Node.js dependencies
└── README_MULTIPLAYER.md (this file)
```

## Server Message Protocol

The server handles these message types:

- `CREATE_ROOM` - Host creates a room
- `JOIN_ROOM` - Player joins with room code
- `START_GAME` - Host starts the game
- `PLAYER_ACTION` - Player roll/move/answer
- `SYNC_STATE` - Broadcast game state updates
- `PLAYER_DISCONNECTED` - Handle disconnects

Enjoy playing Crown Quest with your friends!
