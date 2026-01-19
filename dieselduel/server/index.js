const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios'); // Add axios
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Store active game sessions
const games = {};

// API to create a race (called by Discord Bot)
app.post('/api/create-race', (req, res) => {
    const { challengerId, challengedId, channelId } = req.body;
    
    if (!challengerId || !challengedId) {
        return res.status(400).json({ error: 'Missing player IDs' });
    }

    const gameId = crypto.randomUUID();
    
    // Initialize game state
    games[gameId] = {
        id: gameId,
        channelId,
        status: 'pending',
        players: {
            [challengerId]: { id: challengerId, username: 'Player 1', finished: false, time: null, speed: 0, gear: 0, rpm: 0 },
            [challengedId]: { id: challengedId, username: 'Player 2', finished: false, time: null, speed: 0, gear: 0, rpm: 0 }
        },
        createdAt: Date.now()
    };

    // Generate URLs (Assuming client runs on port 5200 locally)
    const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5200';
    
    const challengerUrl = `${clientBaseUrl}/?gameId=${gameId}&playerId=${challengerId}`;
    const challengedUrl = `${clientBaseUrl}/?gameId=${gameId}&playerId=${challengedId}`;

    console.log(`Race created: ${gameId} between ${challengerId} and ${challengedId}`);

    res.json({
        gameId,
        challengerUrl,
        challengedUrl
    });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_game', ({ gameId, playerId, username }) => {
    socket.join(gameId);
    console.log(`User ${username} (${playerId}) joined game ${gameId}`);
    
    // Validate game exists
    if (!games[gameId]) {
        socket.emit('error', 'Game not found');
        return;
    }

    // Map socket ID to player
    if (games[gameId].players[playerId]) {
        games[gameId].players[playerId].socketId = socket.id;
        games[gameId].players[playerId].username = username; // Update username from client
    } else {
         // Spectator or invalid player
         console.log(`Unknown player ${playerId} for game ${gameId}`);
    }

    // Notify others in room
    const connectedPlayers = Object.values(games[gameId].players).filter(p => p.socketId).length;
    io.to(gameId).emit('player_joined', { playerCount: connectedPlayers });
  });

  socket.on('update_physics', ({ gameId, playerId, data }) => {
      // Relay physics to opponent for "Ghost" or UI updates
      socket.to(gameId).emit('opponent_physics', { playerId, data });
  });

  socket.on('finish_race', ({ gameId, playerId, time, speed }) => {
    console.log(`Player ${playerId} finished in ${time}ms at ${speed} km/h`);
    if (games[gameId] && games[gameId].players[playerId]) {
        games[gameId].players[playerId].finished = true;
        games[gameId].players[playerId].time = time;
        games[gameId].players[playerId].speed = speed;
        
        // Notify everyone (including self for confirmation)
        io.to(gameId).emit('opponent_finished', { playerId, time, speed });

        // SEND RESULT TO ROBOTITO (Discord Bot)
        // We do this immediately for the finished player so they get their time logged
        // irrespective of whether the other player finishes.
        if (games[gameId].channelId) {
            const robotitoUrl = process.env.ROBOTITO_URL || 'http://localhost:3000';
            const axios = require('axios'); // Ensure axios is required at top or here
            
            axios.post(`${robotitoUrl}/api/diesel-result`, {
                playerId,
                time,
                speed,
                channelId: games[gameId].channelId,
                gameId
            }).catch(err => {
                console.error('Failed to send result to Robotito:', err.message);
            });
        }
        
        // Check if both finished
        const allFinished = Object.values(games[gameId].players).every(p => p.finished);
        if (allFinished) {
             console.log(`Race ${gameId} complete!`);
        }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
    // Cleanup logic could go here
  });
});

const PORT = process.env.PORT || 3200;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
