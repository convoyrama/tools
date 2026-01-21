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
const SPAM_COOLDOWN_MS = 30000; // 30 Segundos entre creaciones por IP

// Store active game sessions
const games = {};
// Simple In-Memory Rate Limiter
const requestLog = {}; 

// --- GAME LOGIC HELPER ---
const resolveGame = async (gameId, reason) => {
    const game = games[gameId];
    if (!game) return;

    if (game.timeoutId) clearTimeout(game.timeoutId);

    const p1Id = Object.keys(game.players)[0];
    const p2Id = Object.keys(game.players)[1];
    const p1 = game.players[p1Id]; // Human (usually)
    const p2 = game.players[p2Id]; // Robotito (if isBotChallenge)

    // --- LOGICA BOT TRAMPOSO (Robotito Mode) ---
    if (game.isBotChallenge) {
        // p2 is Robotito
        // Generar tiempo para Robotito basado en el desempeño del humano
        if (p1.finished) {
            // Si el humano terminó, Robotito le gana por poco (10ms a 500ms menos)
            const margin = Math.floor(Math.random() * 490) + 10; // 10ms - 500ms
            p2.time = Math.max(1000, p1.time - margin); // Nunca menos de 1 segundo (seguridad)
            p2.speed = p1.speed + (Math.random() * 10 + 2); // Un poco más rápido
            p2.finished = true;
        } else {
            // Si el humano no terminó (timeout o forfeit), Robotito hace un tiempo decente random
            // Random entre 14.5s (14500ms) y 16.0s (16000ms)
            p2.time = Math.floor(Math.random() * 1500) + 14500;
            p2.speed = 120 + Math.random() * 20; 
            p2.finished = true;
        }
    }

    // ... (Lógica de Ganador igual que antes) ...
    let winner = null;
    let loser = null;
    let type = 'draw';

    if (p1.finished && p2.finished) {
        type = 'vs';
        if (p1.time < p2.time) { winner = p1; loser = p2; } 
        else if (p2.time < p1.time) { winner = p2; loser = p1; } 
        else { if (p1.speed > p2.speed) { winner = p1; loser = p2; } else { winner = p2; loser = p1; } }
    }
    else if (p1.finished && !p2.finished) { type = 'forfeit'; winner = p1; loser = p2; }
    else if (!p1.finished && p2.finished) { type = 'forfeit'; winner = p2; loser = p1; }
    else { type = 'expired'; }

    // Enviar a Robotito
    if (type !== 'expired' && type !== 'draw') {
        try {
            const robotitoUrl = process.env.ROBOTITO_URL || 'http://localhost:3000';
            await axios.post(`${robotitoUrl}/api/diesel-result`, {
                type: type, 
                winner: winner, 
                loser: loser, 
                channelId: game.channelId, 
                gameId: gameId,
                skipLeaderboard: game.isBotChallenge // Skip si es Robotito
            });
        } catch (err) {
            // Silenced
        }
    }

    // --- AGGRESSIVE CLEANUP (RAM SAVER) ---
    // Desconectar sockets para liberar memoria del servidor inmediatamente
    Object.values(game.players).forEach(p => {
        if (p.socketId) {
            const socket = io.sockets.sockets.get(p.socketId);
            if (socket) {
                socket.disconnect(true); // Force disconnect
            }
        }
    });

    // Limpieza final
    delete games[gameId];
};

// API to create a race (called by Discord Bot)
app.post('/api/create-race', (req, res) => {
    // 0. RATE LIMITING (Anti-Spam)
    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    
    if (requestLog[ip] && now - requestLog[ip] < SPAM_COOLDOWN_MS) {
        return res.status(429).json({ error: 'Too many requests. Wait 30s.' });
    }
    requestLog[ip] = now; // Update timestamp

    // Clean old IPs from memory occasionally
    if (Object.keys(requestLog).length > 100) {
        for (const key in requestLog) {
            if (now - requestLog[key] > SPAM_COOLDOWN_MS) delete requestLog[key];
        }
    }

    // 1. Check Capacity
    const currentGames = Object.keys(games).length;
    if (currentGames >= MAX_CONCURRENT_GAMES) {
        return res.status(503).json({ error: 'Server full' });
    }

    let { challengerId, challengedId, channelId, isBotChallenge } = req.body;
    
    if (!challengerId || !challengedId) {
        return res.status(400).json({ error: 'Missing player IDs' });
    }

    // HANDLER AUTO-DESAFÍO
    let realChallengedId = challengedId;
    if (challengerId === challengedId) {
        realChallengedId = challengedId + '_clone';
    }

    const gameId = crypto.randomUUID();
    
    games[gameId] = {
        id: gameId,
        channelId,
        status: 'active',
        isBotChallenge: !!isBotChallenge, // Flag para Modo Robotito
        players: {
            [challengerId]: { id: challengerId, username: 'Player 1', finished: false, time: null, speed: 0 },
            [realChallengedId]: { id: realChallengedId, username: 'Player 2 (Clone)', finished: false, time: null, speed: 0 }
        },
        createdAt: Date.now(),
        timeoutId: setTimeout(() => {
            resolveGame(gameId, 'timeout');
        }, GAME_TIMEOUT_MS)
    };

    const clientBaseUrl = process.env.CLIENT_URL || 'http://23.94.221.241:5200';
    const challengerUrl = `${clientBaseUrl}/?gameId=${gameId}&playerId=${challengerId}`;
    const challengedUrl = `${clientBaseUrl}/?gameId=${gameId}&playerId=${realChallengedId}`;

    res.json({ gameId, challengerUrl, challengedUrl });
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
        
        // Notificar al oponente (para UI)
        io.to(gameId).emit('opponent_finished', { playerId, time, speed });

        // LOGIC PARA MODO ROBOTITO: Resolver inmediatamente
        if (game.isBotChallenge) {
            resolveGame(gameId, 'bot_challenge_finished');
            return;
        }

        // VERIFICAR SI AMBOS TERMINARON
        const allFinished = Object.values(game.players).every(p => p.finished);
        
        if (allFinished) {
             // Si ambos terminaron, resolvemos INMEDIATAMENTE (VS)
             resolveGame(gameId, 'all_finished');
        }
    }
  });

  socket.on('disconnect', () => {
    // Optional cleanup logic
  });
});

const PORT = process.env.PORT || 3200;
server.listen(PORT, () => {
});