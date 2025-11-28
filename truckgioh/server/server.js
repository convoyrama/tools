const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Import uuid
const axios = require('axios'); // Import axios


const app = express();
app.use(express.json()); // To parse JSON bodies from incoming requests
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      // or from localhost/127.0.0.1 on any port during development
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// --- 1. Carga de Datos ---
let gameData = null;
try {
    const dataPath = path.join(__dirname, '../data/game_data.json');
    gameData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log('Game database loaded.');
} catch (error) {
    console.error('Error loading database:', error);
    process.exit(1);
}

// --- 2. Gestión del Estado del Juego (Refactored for multiple games) ---
// Use a Map to store states for multiple active games
const activeGames = new Map(); // gameId -> { gameState, playerSockets: { discordId -> socketId }, discordPlayerIds: { socketId -> discordId } }

// The base URL for the client-side game. This should be configured for deployment.
// For development, assumes client is on port 5173 (Vite default)
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://23.94.221.194:5173';

// --- New HTTP endpoint for creating a game (called by the Discord bot) ---
app.post('/api/create-game', (req, res) => {
    const { challengerId, challengedId, channelId } = req.body;

    if (!challengerId || !challengedId || !channelId) {
        return res.status(400).json({ error: 'Missing challengerId, challengedId, or channelId' });
    }

    const gameId = uuidv4();
    console.log(`Creating new game: ${gameId} for ${challengerId} vs ${challengedId} in channel ${channelId}`);

    // Initialize game state specific to this gameId
    activeGames.set(gameId, {
        gameState: {
            players: {}, status: 'waiting_for_players_to_connect', turn_order: [],
            active_environment: null,
            current_turn: null, current_round: 1, max_rounds: 3,
            player_ready_status: {}
        },
        discordPlayers: {
            [challengerId]: { socketId: null, discordId: challengerId },
            [challengedId]: { socketId: null, discordId: challengedId }
        },
        channelId: channelId, // Store Discord channel ID for results
        connectedSockets: new Map() // socketId -> discordId
    });

    const challengerUrl = `${CLIENT_BASE_URL}/?gameId=${gameId}&playerId=${challengerId}`;
    const challengedUrl = `${CLIENT_BASE_URL}/?gameId=${gameId}&playerId=${challengedId}`;

    res.status(200).json({ gameId, challengerUrl, challengedUrl });


// Original `resetGameState` and `waitingPlayers` are no longer global
// They need to be managed per-game within `activeGames` map
// let gameState = {}; // This will be per-game now
// let waitingPlayers = []; // This array is now deprecated and will be removed/refactored

const resetGameState = (gameId) => {
    // This function will now reset state for a specific gameId
    const game = activeGames.get(gameId);
    if (game) {
        game.gameState = {
            players: {}, status: 'waiting_for_players_to_connect', turn_order: [],
            active_environment: null,
            current_turn: null, current_round: 1, max_rounds: 3,
            player_ready_status: {}
        };
        game.discordPlayers = { // Reset player connection status
            [Object.keys(game.discordPlayers)[0]]: { socketId: null, discordId: Object.keys(game.discordPlayers)[0] },
            [Object.keys(game.discordPlayers)[1]]: { socketId: null, discordId: Object.keys(game.discordPlayers)[1] }
        };
        game.connectedSockets.clear();
        console.log(`Game state for ${gameId} reset.`);
    }
};

// resetGameState(); // No longer call globally on server start

// --- 3. Funciones de Utilidad y Validación ---
const shuffleDeck = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};

const drawHand = (gameId, socketId) => {
    const game = activeGames.get(gameId);
    if (!game) return;
    const player = game.gameState.players[socketId];
    if (!player) return;

    player.hand = { models: [], engines: [], chassis: [], trap_cards: [] };
    // Draw 5 of each regular card type
    ['models', 'engines', 'chassis'].forEach(type => {
        for (let i = 0; i < 5; i++) {
            if (player.decks[type].length === 0) {
                if (player.discard_piles[type].length === 0) {
                    if (gameData[type] && gameData[type].length > 0) {
                        player.decks[type] = shuffleDeck(JSON.parse(JSON.stringify(gameData[type])));
                    } else {
                        break;
                    }
                } else {
                    player.decks[type] = shuffleDeck([...player.discard_piles[type]]);
                    player.discard_piles[type] = [];
                }
            }
            if (player.decks[type].length > 0) player.hand[type].push(player.decks[type].pop());
        }
    });
    // Draw 2 trap cards
    if (game.gameState.current_round > 1) { // Use game.gameState.current_round
        const trapCardType = 'trap_cards';
        for (let i = 0; i < 2; i++) {
            if (player.decks[trapCardType].length === 0) {
                if (player.discard_piles[trapCardType].length === 0) {
                    if (gameData[trapCardType] && gameData[trapCardType].length > 0) {
                        player.decks[trapCardType] = shuffleDeck(JSON.parse(JSON.stringify(gameData[trapCardType])));
                    } else {
                        break;
                    }
                } else {
                    player.decks[trapCardType] = shuffleDeck([...player.discard_piles[trapCardType]]);
                    player.discard_piles[trapCardType] = [];
                }
            }
            if (player.decks[trapCardType].length > 0) player.hand[trapCardType].push(player.decks[trapCardType].pop());
        }
    }
};

const isCombinationValid = ({ model, engine, chassis }) => {
    // In the new structure, the objects themselves contain all necessary data.
    const modelData = model;
    if (!modelData || !modelData.compatible_engine_classes) return { valid: false, message: `Invalid truck model: ${model.name}` };

    const engineClass = engine.class;
    if (!engineClass) return { valid: false, message: `Invalid engine: ${engine.name}` };

    const chassisClasses = chassis.classes;
    if (!chassisClasses) return { valid: false, message: `Invalid chassis: ${chassis.name}` };

    console.log(`Validation Check for Model: ${modelData.name}`);
    console.log(`  Model Compatible Engine Classes: ${modelData.compatible_engine_classes}`);
    console.log(`  Selected Engine Class: ${engineClass}`);
    console.log(`  Model Compatible Chassis Classes: ${modelData.compatible_chassis_classes}`);
    console.log(`  Selected Chassis Classes: ${chassisClasses}`);

    // Check engine compatibility
    const engineCompatible = modelData.compatible_engine_classes.includes(engineClass);
    if (!engineCompatible) return { valid: false, message: `Engine (${engine.name}) incompatible with Truck ${modelData.name}.` };

    // Check chassis compatibility
    const chassisCompatible = modelData.compatible_chassis_classes.some(compClass => chassisClasses.includes(compClass));
    if (!chassisCompatible) return { valid: false, message: `Chassis (${chassis.name}) incompatible with Truck ${modelData.name}.` };

    return { valid: true, message: 'Valid combination.' };
};

const applyModifiers = (truck, environment) => {
    console.log(`Applying modifiers for truck: ${truck.model.name}, Engine HP: ${truck.engine.hp}, Environment: ${environment.name}`);
    let final_hp = truck.engine.hp;
    const engineClass = truck.engine.class;
    const chassisClasses = truck.chassis.classes || [];

    const applyRule = (rule) => {
        if (rule.target === 'engine_class' && rule.class === engineClass) {
            final_hp += rule.modifier;
            console.log(`  Rule applied (Engine Class): ${rule.class}, Modifier: ${rule.modifier}. Current HP: ${final_hp}`);
        }
        if (rule.target === 'chassis_class' && chassisClasses.includes(rule.class)) {
            final_hp += rule.modifier;
            console.log(`  Rule applied (Chassis Class): ${rule.class}, Modifier: ${rule.modifier}. Current HP: ${final_hp}`);
        }
        if (rule.target === 'chassis_name' && rule.name === truck.chassis.name) {
            final_hp += rule.modifier;
            console.log(`  Rule applied (Chassis Name): ${rule.name}, Modifier: ${rule.modifier}. Current HP: ${final_hp}`);
        }
    };

    if (Array.isArray(environment.rules)) environment.rules.forEach(applyRule);

    console.log(`Final HP for ${truck.model.name}: ${final_hp}`);
    return final_hp;
};

// --- 4. Flujo Principal del Juego ---
const endGame = (gameId, winnerDiscordId, loserDiscordId, reason) => {
    const game = activeGames.get(gameId);
    if (!game) {
        console.error(`Attempted to end non-existent game: ${gameId}`);
        return;
    }

    const { gameState, discordPlayers, channelId } = game;
    console.log(`Game ${gameId} over. Winner: ${winnerDiscordId}. Reason: ${reason}`);

    // Notify connected clients for this specific game
    const winnerSocketId = Object.values(discordPlayers).find(p => p.discordId === winnerDiscordId)?.socketId;
    const loserSocketId = Object.values(discordPlayers).find(p => p.discordId === loserDiscordId)?.socketId;

    if (winnerSocketId) io.to(winnerSocketId).emit('game-over', { winner: true, message: reason });
    if (loserSocketId) io.to(loserSocketId).emit('game-over', { winner: false, message: reason });

    // Send results to Discord bot
    // Using the same URL as robotito's config for consistency
    const ROBOTITO_RESULTS_URL = process.env.ROBOTITO_RESULTS_URL || 'http://localhost:3000/game-result';
    axios.post(ROBOTITO_RESULTS_URL, {
        gameId: gameId,
        winnerId: winnerDiscordId,
        loserId: loserDiscordId,
        channelId: channelId
    }).then(() => {
        console.log(`Game result for ${gameId} sent to Discord bot.`);
    }).catch(error => {
        console.error(`Error sending game result for ${gameId} to Discord bot:`, error.message);
    });

    // Clean up game state
    activeGames.delete(gameId);
    console.log(`Game ${gameId} removed from active games.`);
};

const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const startGame = (gameId) => {
    const game = activeGames.get(gameId);
    if (!game) return;

    const { gameState, discordPlayers, connectedSockets } = game;
    const playerSocketIds = Array.from(connectedSockets.keys());

    if (playerSocketIds.length < 2) {
        console.log(`Game ${gameId} not enough players connected to start: ${playerSocketIds.length}`);
        return;
    }

    gameState.status = 'setup';
    gameState.turn_order = shuffleArray(playerSocketIds); // Shuffle for random turn order

    playerSocketIds.forEach(socketId => {
        const discordId = connectedSockets.get(socketId);
        gameState.players[socketId] = {
            id: socketId, fuel: 500, // Initial fuel set to 500
            decks: {
                models: shuffleDeck(JSON.parse(JSON.stringify(gameData.models))),
                engines: shuffleDeck(JSON.parse(JSON.stringify(gameData.engines))),
                chassis: shuffleDeck(JSON.parse(JSON.stringify(gameData.chassis))),
                trap_cards: shuffleDeck(JSON.parse(JSON.stringify(gameData.trap_cards))),
            },
            hand: { models: [], engines: [], chassis: [], trap_cards: [] },
            discard_piles: { models: [], engines: [], chassis: [] },
            submitted_lineup: null, final_lineup: []
        };
        gameState.player_ready_status[socketId] = false;
        drawHand(gameId, socketId); // Pass gameId to drawHand
    });

    playerSocketIds.forEach(socketId => {
        io.to(socketId).emit('game-start', {
            players: Object.keys(gameState.players),
            round: gameState.current_round,
            myState: gameState.players[socketId],
            gameId: gameId // Inform client of gameId
        });
    });
    console.log(`Game ${gameId} started. Round ${gameState.current_round}. Waiting for players to assemble their convoy.`);
};

// --- 5. Conexiones y Eventos del Socket (Refactored for multiple games) ---
io.on('connection', (socket) => {
    // Expect gameId and playerId (Discord ID) from the client on connection handshake
    const { gameId, playerId: discordId } = socket.handshake.query;

    if (!gameId || !discordId) {
        console.log(`Socket ${socket.id} disconnected: Missing gameId or playerId in handshake.`);
        socket.emit('connection-error', 'Missing gameId or playerId.');
        return socket.disconnect();
    }

    const game = activeGames.get(gameId);

    if (!game) {
        console.log(`Socket ${socket.id} disconnected: Game ${gameId} not found.`);
        socket.emit('connection-error', `Game ${gameId} not found.`);
        return socket.disconnect();
    }

    const { gameState, discordPlayers, connectedSockets } = game;

    // Check if this Discord ID is part of this game and not already connected
    if (!discordPlayers[discordId]) {
        console.log(`Socket ${socket.id} disconnected: Discord ID ${discordId} not authorized for game ${gameId}.`);
        socket.emit('connection-error', 'Not authorized for this game.');
        return socket.disconnect();
    }
    if (discordPlayers[discordId].socketId) {
        console.log(`Socket ${socket.id} disconnected: Discord ID ${discordId} already connected to game ${gameId}.`);
        socket.emit('connection-error', 'Player already connected.');
        return socket.disconnect();
    }

    // Assign socket to Discord player
    discordPlayers[discordId].socketId = socket.id;
    connectedSockets.set(socket.id, discordId);
    socket.join(gameId);

    console.log(`Player ${discordId} (${socket.id}) joined game ${gameId}. Total connected: ${connectedSockets.size}`);

    // If both players are connected, start the game for this specific gameId
    if (connectedSockets.size === 2 && gameState.status === 'waiting_for_players_to_connect') {
        startGame(gameId);
    }
    
    socket.on('validate-combination', (combination, callback) => {
        const result = isCombinationValid(combination);
        callback(result);
    });

    socket.on('player-ready-with-lineup', (lineup) => {
        if (!gameState.players[socket.id] || (gameState.status !== 'setup' && gameState.status !== 'replenishing')) return;

        const player = gameState.players[socket.id];
        let newFinalLineup = [];
        const submittedTrucks = lineup.filter(item => item.type === 'truck');
        
        let calculatedFuel = 0;
        submittedTrucks.forEach(truck => {
            if (truck.chassis && truck.chassis.fuel_capacity !== undefined) {
                calculatedFuel += truck.chassis.fuel_capacity;
            }
        });

        if (gameState.status === 'replenishing') {
            player.fuel += calculatedFuel;
        } else {
            player.fuel = calculatedFuel;
        }
        console.log(`Player ${socket.id} submitted lineup for game ${gameId}. Calculated Fuel: ${player.fuel}`);

        for (const item of submittedTrucks) {
            if (!isCombinationValid(item).valid) {
                return socket.emit('invalid-lineup', `Your fleet contains an invalid truck combination.`);
            }
            newFinalLineup.push({
                ...item,
                id: `${player.id}_truck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'truck',
                revealed: false,
                immobilized: false,
                has_attacked_this_round: false
            });
        }

        let finalSubmittedLineup;
        if (gameState.status === 'replenishing') {
            const survivingItems = player.final_lineup.filter(existingItem => 
                newFinalLineup.some(newItem => newItem.id === existingItem.id)
            ).map(item => ({...item, immobilized: false, has_attacked_this_round: false }));

            finalSubmittedLineup = [...survivingItems, ...newFinalLineup.filter(newItem =>
                !survivingItems.some(existingItem => existingItem.id === newItem.id)
            )];
        } else {
            finalSubmittedLineup = newFinalLineup;
        }

        player.submitted_lineup = finalSubmittedLineup;
        gameState.player_ready_status[socket.id] = true;
        console.log(`Player ${socket.id} has confirmed their fleet of ${finalSubmittedLineup.length} items for game ${gameId}. Current Fuel: ${player.fuel}`);

        if (Object.values(gameState.player_ready_status).every(s => s)) {
            console.log(`Both players ready for game ${gameId}. Starting battle.`);
            Object.keys(gameState.players).forEach(id => gameState.player_ready_status[id] = false);

            gameState.status = 'battle';
            gameState.current_turn = gameState.turn_order[0];
            gameState.active_environment = gameData.environments[Math.floor(Math.random() * gameData.environments.length)];
            
            Object.values(gameState.players).forEach(p => {
                p.final_lineup = p.submitted_lineup.map((item) => {
                    if (item.type === 'truck') {
                        return { ...item, final_hp: applyModifiers(item, gameState.active_environment) };
                    }
                    return item;
                });
            });
            
            Object.keys(gameState.players).forEach(playerId => {
                const opponentId = Object.keys(gameState.players).find(id => id !== playerId);
                const opponentLineup = gameState.players[opponentId].final_lineup.map(item => ({
                    id: item.id,
                    type: item.type,
                    revealed: item.revealed,
                    name: item.revealed ? item.model.name : undefined,
                    immobilized: item.immobilized
                }));

                io.to(playerId).emit('battle-start', {
                    environment: gameState.active_environment,
                    my_final_lineup: gameState.players[playerId].final_lineup,
                    opponent_final_lineup: opponentLineup,
                    turn: gameState.current_turn
                });
            });
        }
    });

    socket.on('play-trap-card', ({ trapCardName, targetId }) => {
        const player = gameState.players[socket.id];
        const opponentId = gameState.turn_order.find(id => id !== socket.id);
        const opponent = gameState.players[opponentId];

        if (!player || !player.hand || !player.hand.trap_cards) {
            return socket.emit('invalid-action', `Player data or hand is invalid for playing trap card.`);
        }

        const playedTrapCardIndex = player.hand.trap_cards.findIndex(card => card.name === trapCardName);
        if (playedTrapCardIndex === -1) {
            return socket.emit('invalid-action', `Trap card "${trapCardName}" not found in hand.`);
        }

        const playedTrapCard = player.hand.trap_cards.splice(playedTrapCardIndex, 1)[0];
        console.log(`Player ${socket.id} played trap card: ${playedTrapCard.name}. Target: ${targetId} for game ${gameId}`);

        if (playedTrapCard.effects && Array.isArray(playedTrapCard.effects)) {
            playedTrapCard.effects.forEach(effect => {
                // (The logic inside this switch remains the same, but it's now scoped to this game)
                // ...
            });
        }
        advanceGameTurn(gameId, socket.id);
    });

    socket.on('attack', ({ attacker_truck_id, target_truck_id }) => {
        if (gameState.status !== 'battle' || socket.id !== gameState.current_turn) {
            return;
        }

        const player = gameState.players[socket.id];
        const opponentId = gameState.turn_order.find(id => id !== socket.id);
        const opponent = gameState.players[opponentId];
        
        const attackerTruck = player.final_lineup.find(t => t.id === attacker_truck_id && t.type === 'truck');

        if (!attackerTruck || attackerTruck.has_attacked_this_round || attackerTruck.immobilized) {
            return socket.emit('invalid-action', 'This truck cannot attack.');
        }

        attackerTruck.has_attacked_this_round = true;
        if (!attackerTruck.revealed) {
            attackerTruck.revealed = true;
            io.to(gameId).emit('card-revealed', { truckId: attacker_truck_id, truckData: attackerTruck });
        }

        const targetItem = opponent.final_lineup.find(t => t.id === target_truck_id);

        if (targetItem) {
            if (targetItem.type === 'truck') {
                if (!targetItem.revealed) {
                    targetItem.revealed = true;
                    io.to(gameId).emit('card-revealed', { truckId: target_truck_id, truckData: targetItem });
                }
                const damage = Math.abs(attackerTruck.final_hp - targetItem.final_hp);
                let battleResult = {};

                if (attackerTruck.final_hp >= targetItem.final_hp) {
                    opponent.fuel -= damage;
                    opponent.final_lineup = opponent.final_lineup.filter(t => t.id !== target_truck_id);
                    battleResult = { loser_truck_id: target_truck_id, damage_dealt: damage };
                } else {
                    player.fuel -= damage;
                    player.final_lineup = player.final_lineup.filter(t => t.id !== attacker_truck_id);
                    battleResult = { loser_truck_id: attacker_truck_id, damage_dealt: damage };
                }
                io.to(gameId).emit('turn-result', { ...battleResult, updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel } });
            }
        } else if (opponent.final_lineup.filter(i => i.type === 'truck').length === 0 && target_truck_id === "opponent_player_fuel") {
            const directDamage = attackerTruck.final_hp;
            opponent.fuel -= directDamage;
            io.to(gameId).emit('turn-result', {
                direct_damage_to_player: opponentId,
                damage_dealt: directDamage,
                updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }
            });
        } else {
            return socket.emit('invalid-action', 'Target is not valid.');
        }

        if (opponent.fuel <= 0) {
            const winnerDiscordId = connectedSockets.get(player.id);
            const loserDiscordId = connectedSockets.get(opponent.id);
            return endGame(gameId, winnerDiscordId, loserDiscordId, "Opponent's Fuel reached zero.");
        }
        if (player.fuel <= 0) {
            const winnerDiscordId = connectedSockets.get(opponent.id);
            const loserDiscordId = connectedSockets.get(player.id);
            return endGame(gameId, winnerDiscordId, loserDiscordId, "Player's Fuel reached zero.");
        }

        advanceGameTurn(gameId, socket.id);
    });

    const advanceGameTurn = (gameId, lastPlayerSocketId) => {
        const game = activeGames.get(gameId);
        if (!game) return;
        const { gameState } = game;

        const lastPlayer = gameState.players[lastPlayerSocketId];
        if (lastPlayer && lastPlayer.hand && lastPlayer.hand.trap_cards.length > 0) {
            lastPlayer.hand.trap_cards = [];
        }
    
        const allTrucksAttacked = Object.values(gameState.players).every(p => 
            p.final_lineup.filter(item => item.type === 'truck' && !item.immobilized).every(truck => truck.has_attacked_this_round)
        );

        if (allTrucksAttacked) {
            gameState.current_round++;
            gameState.turn_order.push(gameState.turn_order.shift());

            if (gameState.current_round > gameState.max_rounds) {
                const p1 = gameState.players[gameState.turn_order[0]];
                const p2 = gameState.players[gameState.turn_order[1]];
                let winnerDiscordId = connectedSockets.get(p2.id);
                let loserDiscordId = connectedSockets.get(p1.id);
                let reason = "More Fuel at the end.";
                if (p1.fuel > p2.fuel) {
                    winnerDiscordId = connectedSockets.get(p1.id);
                    loserDiscordId = connectedSockets.get(p2.id);
                } else if (p1.fuel === p2.fuel) {
                    winnerDiscordId = null;
                    loserDiscordId = null;
                    reason = "The game is a draw!";
                }
                return endGame(gameId, winnerDiscordId, loserDiscordId, reason);
            }

            gameState.status = 'replenishing';
            Object.keys(gameState.players).forEach(id => gameState.player_ready_status[id] = false);

            Object.values(gameState.players).forEach(p => {
                p.final_lineup.forEach(item => { if (item.type === 'truck') item.has_attacked_this_round = false; });
                drawHand(gameId, p.id);
                io.to(p.id).emit('start-replenishment', {
                    round: gameState.current_round,
                    new_hand: p.hand,
                    surviving_lineup: p.final_lineup
                });
            });
        } else {
            gameState.current_turn = gameState.turn_order.find(id => id !== gameState.current_turn);
            io.to(gameId).emit('next-turn', { next_turn: gameState.current_turn, round: gameState.current_round });
            
            const nextPlayer = gameState.players[gameState.current_turn];
            const canAttack = nextPlayer.final_lineup.some(item => item.type === 'truck' && !item.immobilized && !item.has_attacked_this_round);

            if (!canAttack) {
                nextPlayer.final_lineup.forEach(item => { if (item.type === 'truck') item.has_attacked_this_round = true; });
                setTimeout(() => advanceGameTurn(gameId, gameState.current_turn), 500); 
            }
        }
    };

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id} from game ${gameId}`);
        if (game) {
            connectedSockets.delete(socket.id);
            if (discordPlayers[discordId]) {
                discordPlayers[discordId].socketId = null;
            }

            if (gameState.status !== 'ended') {
                 const opponentDiscordId = Object.keys(discordPlayers).find(id => id !== discordId);
                 if (opponentDiscordId) {
                    endGame(gameId, opponentDiscordId, discordId, "Opponent disconnected.");
                    gameState.status = 'ended';
                 }
            }

            if (connectedSockets.size === 0) {
                 activeGames.delete(gameId);
                 console.log(`Game ${gameId} cleaned up after all players disconnected.`);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
