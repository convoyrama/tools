const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Store active game sessions
const games = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_game', ({ gameId, username }) => {
    socket.join(gameId);
    console.log(`User ${username} (${socket.id}) joined game ${gameId}`);
    
    // Initialize game if not exists
    if (!games[gameId]) {
        games[gameId] = { players: {} };
    }
    
    games[gameId].players[socket.id] = { username, finished: false, time: null };

    // Notify others in room
    io.to(gameId).emit('player_joined', { playerCount: Object.keys(games[gameId].players).length });
  });

  socket.on('finish_race', ({ gameId, time, speed }) => {
    console.log(`Player ${socket.id} finished in ${time}ms at ${speed} km/h`);
    if (games[gameId] && games[gameId].players[socket.id]) {
        games[gameId].players[socket.id].finished = true;
        games[gameId].players[socket.id].time = time;
        games[gameId].players[socket.id].speed = speed;
        
        io.to(gameId).emit('opponent_finished', { playerId: socket.id, time, speed });
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
