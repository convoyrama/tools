const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
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

// --- CONFIGURACIÓN DE RECURSOS ---
const MAX_CONCURRENT_GAMES = 3; // Límite duro de 3 partidas
const GAME_TIMEOUT_MS = 3 * 60 * 1000; // 3 Minutos

// Store active game sessions
const games = {};

// --- GAME LOGIC HELPER ---
const resolveGame = async (gameId, reason) => {
    const game = games[gameId];
    if (!game) return;

    console.log(`Resolving game ${gameId}. Reason: ${reason}`);

    // Limpiar el Timeout para que no se ejecute dos veces
    if (game.timeoutId) clearTimeout(game.timeoutId);

    const p1Id = Object.keys(game.players)[0];
    const p2Id = Object.keys(game.players)[1];
    const p1 = game.players[p1Id];
    const p2 = game.players[p2Id];

    // Determinar estado
    let winner = null;
    let loser = null;
    let type = 'draw'; // draw, vs, forfeit, expired

    // Caso 1: Ambos terminaron (VS normal)
    if (p1.finished && p2.finished) {
        type = 'vs';
        if (p1.time < p2.time) { winner = p1; loser = p2; }
        else { winner = p2; loser = p1; }
    }
    // Caso 2: Solo P1 terminó (P2 abandonó)
    else if (p1.finished && !p2.finished) {
        type = 'forfeit';
        winner = p1;
        loser = p2;
    }
    // Caso 3: Solo P2 terminó (P1 abandonó)
    else if (!p1.finished && p2.finished) {
        type = 'forfeit';
        winner = p2;
        loser = p1;
    }
    // Caso 4: Nadie terminó (Expiró)
    else {
        type = 'expired';
    }

    // Enviar a Robotito si hubo al menos un corredor
    if (type !== 'expired' && type !== 'draw') {
        try {
            const robotitoUrl = process.env.ROBOTITO_URL || 'http://localhost:3000';
            await axios.post(`${robotitoUrl}/api/diesel-result`, {
                type: type, // 'vs' or 'forfeit'
                winner: winner,
                loser: loser,
                channelId: game.channelId,
                gameId: gameId
            });
            console.log(`Result sent to Robotito for game ${gameId}`);
        } catch (err) {
            console.error('Failed to send result to Robotito:', err.message);
        }
    } else {
        console.log(`Game ${gameId} expired without results.`);
    }

    // Limpieza final
    delete games[gameId];
    console.log(`Game ${gameId} cleaned up. Active games: ${Object.keys(games).length}`);
};

// API to create a race (called by Discord Bot)
app.post('/api/create-race', (req, res) => {
    // 1. Check Capacity
    const currentGames = Object.keys(games).length;
    if (currentGames >= MAX_CONCURRENT_GAMES) {
        console.log(`Rejected creation. Server full (${currentGames}/${MAX_CONCURRENT_GAMES})`);
        return res.status(503).json({ error: 'Server full' });
    }

    const { challengerId, challengedId, channelId } = req.body;
    
    if (!challengerId || !challengedId) {
        return res.status(400).json({ error: 'Missing player IDs' });
    }

    const gameId = crypto.randomUUID();
    
    // Initialize game state
    games[gameId] = {
        id: gameId,
        channelId,
        status: 'active',
        players: {
            [challengerId]: { id: challengerId, username: 'Player 1', finished: false, time: null, speed: 0 },
            [challengedId]: { id: challengedId, username: 'Player 2', finished: false, time: null, speed: 0 }
        },
        createdAt: Date.now(),
        // 2. Set Auto-Expiration Timer
        timeoutId: setTimeout(() => {
            resolveGame(gameId, 'timeout');
        }, GAME_TIMEOUT_MS)
    };

    const clientBaseUrl = process.env.CLIENT_URL || 'http://23.94.221.241:5200';
    
    const challengerUrl = `${clientBaseUrl}/?gameId=${gameId}&playerId=${challengerId}`;
    const challengedUrl = `${clientBaseUrl}/?gameId=${gameId}&playerId=${challengedId}`;

    console.log(`Race created: ${gameId} (${currentGames + 1}/${MAX_CONCURRENT_GAMES} active)`);

    res.json({
        gameId,
        challengerUrl,
        challengedUrl
    });
});

io.on('connection', (socket) => {
  socket.on('join_game', ({ gameId, playerId, username }) => {
    socket.join(gameId);
    
    if (!games[gameId]) {
        socket.emit('error', 'Game not found or expired');
        return;
    }

    if (games[gameId].players[playerId]) {
        games[gameId].players[playerId].socketId = socket.id;
        games[gameId].players[playerId].username = username;
    }

    const connectedPlayers = Object.values(games[gameId].players).filter(p => p.socketId).length;
    io.to(gameId).emit('player_joined', { playerCount: connectedPlayers });
  });

  socket.on('update_physics', ({ gameId, playerId, data }) => {
      socket.to(gameId).emit('opponent_physics', { playerId, data });
  });

  socket.on('finish_race', ({ gameId, playerId, time, speed }) => {
    const game = games[gameId];
    if (game && game.players[playerId]) {
        // Guardar datos del jugador
        game.players[playerId].finished = true;
        game.players[playerId].time = time;
        game.players[playerId].speed = speed;
        
        console.log(`Player ${playerId} finished game ${gameId}`);

        // Notificar al oponente (para UI)
        io.to(gameId).emit('opponent_finished', { playerId, time, speed });

        // VERIFICAR SI AMBOS TERMINARON
        const allFinished = Object.values(game.players).every(p => p.finished);
        
        if (allFinished) {
             // Si ambos terminaron, resolvemos INMEDIATAMENTE (VS)
             resolveGame(gameId, 'all_finished');
        } else {
             // Si falta uno, NO hacemos nada. Esperamos al timeout o al otro jugador.
             console.log(`Game ${gameId}: Waiting for opponent...`);
        }
    }
  });

  socket.on('disconnect', () => {
    // Optional cleanup logic
  });
});

const PORT = process.env.PORT || 3200;
server.listen(PORT, () => {
  console.log(`Diesel Duel Server running on port ${PORT}`);
  console.log(`Config: Max Games=${MAX_CONCURRENT_GAMES}, Timeout=${GAME_TIMEOUT_MS/1000}s`);
});