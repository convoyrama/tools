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
    origin: [
      "http://23.94.221.241:5173", 
      "http://localhost:5173"
    ],
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
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:5173';

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
            player_ready_status: {},
            passCounter: 0
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
});


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

    player.hand = { engines: [], chassis: [], trap_cards: [] };
    // Draw 5 of each regular card type (excluding models)
    ['engines', 'chassis'].forEach(type => {
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
    // Trap cards are no longer drawn to the hand.
};

const isCombinationValid = ({ engine, chassis }) => {
    // Simplified validation: Engine Class must be compatible with Chassis
    
    const engineClass = engine.class;
    if (!engineClass) return { valid: false, message: `Invalid engine: ${engine.name}` };

    const chassisClasses = chassis.classes;
    if (!chassisClasses) return { valid: false, message: `Invalid chassis: ${chassis.name}` };

    console.log(`Validation Check (Simplified):`);
    console.log(`  Engine Class: ${engineClass}`);
    console.log(`  Chassis Compatible Classes: ${chassisClasses}`);

    // Check compatibility: Does the chassis support this engine class?
    const compatible = chassisClasses.includes(engineClass);
    if (!compatible) return { valid: false, message: `Chassis (${chassis.name}) supports [${chassisClasses.join(', ')}], but Engine is ${engineClass}.` };

    return { valid: true, message: 'Valid combination.' };
};

const applyModifiers = (truck, environment) => {
    console.log(`Applying modifiers for truck: ${truck.model.name}, Engine HP: ${truck.engine.hp}, Environment: ${environment.name}`);
    let final_hp = truck.engine.hp;
    const engineClass = truck.engine.class;
    const chassisClasses = truck.chassis.classes || [];

    // Apply Model HP Bonus - REMOVED for simplification
    // The Engine HP is now the base HP.
    
    // Auto-generate a virtual model name if missing (for legacy compatibility in rules)
    const modelName = truck.model ? truck.model.name : engineClass;

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
        // NEW: Handle engine_name targets
        if (rule.target === 'engine_name' && rule.name === truck.engine.name) {
            final_hp += rule.modifier;
            console.log(`  Rule applied (Engine Name): ${rule.name}, Modifier: ${rule.modifier}. Current HP: ${final_hp}`);
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
            id: socketId, fuel: 0, // Initial fuel is 0 until lineup is submitted
            decks: {
                engines: shuffleDeck(JSON.parse(JSON.stringify(gameData.engines))),
                chassis: shuffleDeck(JSON.parse(JSON.stringify(gameData.chassis))),
                trap_cards: shuffleDeck(JSON.parse(JSON.stringify(gameData.trap_cards))),
            },
            hand: { engines: [], chassis: [], trap_cards: [] },
            discard_piles: { engines: [], chassis: [], trap_cards: [] },
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
            if (truck.engine && truck.engine.fuel_modifier !== undefined) {
                calculatedFuel += truck.engine.fuel_modifier; // This is a negative value
            }
        });

        // Fuel Calculation Logic
        // Engines consume fuel (negative modifier). Chassis adds capacity (positive).
        // Net Result: Usually positive capacity addition or slight cost.
        // GDD says: "Cost of Deployment: Each truck consumes fuel." but modifiers in JSON are mixed.
        // Let's strict to: Fuel = Current Fuel + (Sum of Modifiers of NEW trucks).
        // Since modifiers in JSON are negative for Engines (consumption) and Positive for Chassis (tank size),
        // we just sum them up. 
        
        if (gameState.current_round === 1) {
            // Initial Setup: Base 1500 + Fleet Modifiers
            player.fuel = 1500 + calculatedFuel;
        } else {
            // Replenishment: Current Fuel + Modifiers of ONLY the NEW trucks
            // calculatedFuel currently includes ALL submitted trucks. We need to diff.
            // Actually, submitted_lineup contains everything.
            // We should only apply the cost of the *added* trucks.
            
            // Find new trucks by comparing IDs with previous final_lineup
            // But wait, IDs are generated AFTER this block usually? No, generated here.
            // Oh, the client sends objects without IDs for new ones usually? Or we generate them.
            // Let's assume calculatedFuel is the total capacity/cost of the WHOLE fleet.
            // If Fuel is "Life", upgrading fleet shouldn't heal you?
            // "Persistencia: El combustible NO se regenera... Se acumula el daño."
            
            // CORRECT LOGIC:
            // Round 1: Fuel = 1500 + FleetCapacity.
            // Round > 1: Fuel = PreviousFuel - CostOfNewTrucks?
            // Or is Fuel meant to be "Remaining Tank"?
            // If I add a chassis with +600L tank, my total capacity increases.
            // Let's simplify: In Round > 1, we DO NOT modify Fuel based on lineup changes to avoid "healing" or complex diffs.
            // You play with what you have left.
            // So: Remove the `player.fuel += calculatedFuel` for rounds > 1.
            console.log(`Round ${gameState.current_round} Replenishment: Fuel remains at ${player.fuel}. (No cost/bonus applied for new units yet)`);
        }
        console.log(`Player ${socket.id} lineup accepted. Fuel: ${player.fuel}`);

        for (const item of submittedTrucks) {
            // Auto-generate Virtual Model based on Engine Class
            if (!item.model && item.engine) {
                item.model = { name: item.engine.class }; 
            }

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
            
            // Announce the real starting fuel for both players before battle
            const initialFuelStatus = {
                [gameState.turn_order[0]]: gameState.players[gameState.turn_order[0]].fuel,
                [gameState.turn_order[1]]: gameState.players[gameState.turn_order[1]].fuel
            };
            io.to(gameId).emit('fuel-updated', initialFuelStatus);

            Object.keys(gameState.players).forEach(id => gameState.player_ready_status[id] = false);

            gameState.status = 'battle';
            gameState.current_turn = gameState.turn_order[0];
            gameState.active_environment = gameData.environments[Math.floor(Math.random() * gameData.environments.length)];
            
            Object.values(gameState.players).forEach(p => {
                p.final_lineup = p.submitted_lineup.map((item) => {
                    if (item.type === 'truck') {
                        return { ...item, final_hp: applyModifiers(item, gameState.active_environment) };
                    }
                    return item; // Keep other item types as is
                });
            });

            // Auto-deploy a random trap card for each player from round 2 onwards
            if (gameState.current_round > 1) {
                Object.values(gameState.players).forEach(p => {
                    if (gameData.trap_cards && gameData.trap_cards.length > 0) {
                        const randomTrapCard = gameData.trap_cards[Math.floor(Math.random() * gameData.trap_cards.length)];
                        p.final_lineup.push({
                            type: 'trap_card',
                            card: randomTrapCard,
                            id: `trap_${p.id}_${gameState.current_round}`,
                            revealed: false,
                            immobilized: false,
                            name: randomTrapCard.name // Pass name for display
                        });
                        console.log(`Auto-deploying trap card '${randomTrapCard.name}' for player ${p.id}`);
                    }
                });
            }
            
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

        let trapCardBattleResult = {
            message: `¡${player.id} jugó una carta trampa: ${playedTrapCard.name}!`,
            specific_effects: [] // Collect details for client messages
        };
        let commonTurnResult = {};

        if (playedTrapCard.effects && Array.isArray(playedTrapCard.effects)) {
            playedTrapCard.effects.forEach(effect => {
                switch (effect.type) {
                    case 'steal_fuel':
                        if (effect.target === 'opponent_truck' && targetId) {
                            const targetTruck = opponent.final_lineup.find(item => item.id === targetId && item.type === 'truck');
                            if (targetTruck && effect.amounts) {
                                const amountEffect = effect.amounts.find(amt => amt.class === targetTruck.model.name);
                                if (amountEffect) {
                                    const stolenFuel = amountEffect.value;
                                    opponent.fuel -= stolenFuel;
                                    player.fuel += stolenFuel;
                                    trapCardBattleResult.specific_effects.push({
                                        type: 'steal_fuel',
                                        stolenFuel: stolenFuel,
                                        fromPlayerId: opponent.id,
                                        toPlayerId: player.id
                                    });
                                }
                            }
                        }
                        break;
                    case 'reveal_own_truck':
                        const hiddenTrucks = player.final_lineup.filter(item => item.type === 'truck' && !item.revealed);
                        if (hiddenTrucks.length > 0) {
                            const truckToReveal = hiddenTrucks[Math.floor(Math.random() * hiddenTrucks.length)];
                            truckToReveal.revealed = true;
                            io.to(gameId).emit('card-revealed', { truckId: truckToReveal.id, truckData: truckToReveal }); // Global reveal
                            trapCardBattleResult.specific_effects.push({
                                type: 'reveal_own_truck',
                                truckId: truckToReveal.id
                            });
                        }
                        break;
                    case 'immobilize_truck':
                        if (effect.target === 'opponent_truck' && targetId) {
                            const targetTruck = opponent.final_lineup.find(item => item.id === targetId && item.type === 'truck');
                            if (targetTruck) {
                                targetTruck.immobilized = true;
                                trapCardBattleResult.specific_effects.push({
                                    type: 'immobilize_truck',
                                    truckId: targetTruck.id,
                                    targetPlayerId: opponent.id
                                });
                            }
                        }
                        break;
                    case 'lose_fuel':
                        if (effect.target === 'self') {
                            player.fuel -= effect.value;
                            trapCardBattleResult.specific_effects.push({
                                type: 'lose_fuel',
                                lostFuel: effect.value,
                                playerId: player.id
                            });
                        }
                        break;
                    case 'destroy_truck':
                        if (effect.target === 'opponent_truck_hidden' && targetId) {
                            const targetTruckIndex = opponent.final_lineup.findIndex(item => item.id === targetId && item.type === 'truck' && !item.revealed);
                            if (targetTruckIndex !== -1) {
                                const destroyedTruck = opponent.final_lineup.splice(targetTruckIndex, 1)[0];
                                opponent.fuel -= 100; // Arbitrary fuel loss for destruction
                                trapCardBattleResult.specific_effects.push({
                                    type: 'destroy_truck',
                                    truckId: destroyedTruck.id,
                                    targetPlayerId: opponent.id,
                                    fuelLost: 100
                                });
                            }
                        }
                        break;
                    case 'reveal_all_self':
                        player.final_lineup.forEach(item => {
                            if (item.type === 'truck' && !item.revealed) {
                                item.revealed = true;
                                io.to(gameId).emit('card-revealed', { truckId: item.id, truckData: item }); // Global reveal
                            }
                        });
                        trapCardBattleResult.specific_effects.push({ type: 'reveal_all_self', playerId: player.id });
                        break;
                }
            });
        }

        commonTurnResult = {
            ...trapCardBattleResult,
            updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }
        };

        // Send personalized state to each player
        io.to(player.id).emit('turn-result', {
            ...commonTurnResult,
            updated_my_lineup: player.final_lineup,
            updated_opponent_lineup: opponent.final_lineup
        });

        io.to(opponent.id).emit('turn-result', {
            ...commonTurnResult,
            updated_my_lineup: opponent.final_lineup, // Swapped
            updated_opponent_lineup: player.final_lineup // Swapped
        });
        
        // After effect is applied, advance turn
        advanceGameTurn(gameId, socket.id);
    });

    socket.on('attack', ({ attacker_truck_id, target_truck_id }) => {
        if (gameState.status !== 'battle' || socket.id !== gameState.current_turn) {
            return;
        }

        gameState.passCounter = 0; // Reset pass counter

        const player = gameState.players[socket.id];
        const opponentId = gameState.turn_order.find(id => id !== socket.id);
        const opponent = gameState.players[opponentId];
        
        // Find attacker (can be Truck OR Trap Card)
        const attackerItem = player.final_lineup.find(t => t.id === attacker_truck_id);

        if (!attackerItem || attackerItem.has_attacked_this_round || attackerItem.immobilized) {
            return socket.emit('invalid-action', 'This unit cannot act.');
        }

        attackerItem.has_attacked_this_round = true;
        const targetItem = opponent.final_lineup.find(t => t.id === target_truck_id);
        
        // --- CASE 1: ATTACKER IS A TRAP CARD (The "Bullet" logic) ---
        if (attackerItem.type === 'trap_card') {
            const trapCard = attackerItem.card;
            console.log(`Player ${player.id} ACTIVATED trap card ${trapCard.name} against ${target_truck_id}`);
            
            // Reveal the trap used
            attackerItem.revealed = true;
            io.to(gameId).emit('card-revealed', { truckId: attackerItem.id, truckData: attackerItem });

            let trapResult = {
                trap_activated: true,
                trap_name: trapCard.name,
                attacker_id: player.id, // The one who used the trap
                defender_id: opponent.id,
                specific_effects: []
            };

            // Apply Effect based on target type
            if (targetItem && targetItem.type === 'truck') {
                switch (trapCard.name) {
                    case 'Police':
                        // Police used OFFENSIVELY: Maybe arrests the truck? Or destroys it?
                        // "Police" usually defensive, but if used as a bullet... let's say it destroys the target.
                        // Or strictly follows description "Destroys attacking truck". 
                        // If used offensively, maybe "Arrest" -> Immobilize? 
                        // Let's assume DESTROY for now as it's a "bullet".
                        opponent.final_lineup = opponent.final_lineup.filter(t => t.id !== target_truck_id);
                        trapResult.specific_effects.push({ type: 'text', message: `Police Raid! Target truck destroyed!` });
                        trapResult.loser_truck_id = target_truck_id;
                        break;
                    case 'Breakdown':
                        // Immobilize target
                        targetItem.immobilized = true;
                        trapResult.specific_effects.push({ type: 'immobilize_truck', truckId: target_truck_id });
                        break;
                    case 'Fuel Thief':
                        // Steal Fuel from target player (or based on target truck class)
                        let stolen = 150; 
                        opponent.fuel -= stolen;
                        player.fuel += stolen;
                        trapResult.specific_effects.push({ type: 'steal_fuel', stolenFuel: stolen, fromPlayerId: opponent.id, toPlayerId: player.id });
                        break;
                }
            } else if (target_truck_id === "opponent_player_fuel" || (target_truck_id === null && !targetItem)) {
                 // Targeting Player directly
                 if (trapCard.name === 'Fuel Thief') {
                     let stolen = 150;
                     opponent.fuel -= stolen;
                     player.fuel += stolen;
                     trapResult.specific_effects.push({ type: 'steal_fuel', stolenFuel: stolen, fromPlayerId: opponent.id, toPlayerId: player.id });
                 } else {
                     trapResult.specific_effects.push({ type: 'text', message: `${trapCard.name} used on player, but had no valid effect.` });
                 }
            }

            // Destroy the trap card after use (It's a bullet)
            player.final_lineup = player.final_lineup.filter(t => t.id !== attacker_truck_id);

            // Send results
            io.to(player.id).emit('turn-result', { ...trapResult, updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }, updated_my_lineup: player.final_lineup, updated_opponent_lineup: opponent.final_lineup });
            io.to(opponent.id).emit('turn-result', { ...trapResult, updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }, updated_my_lineup: opponent.final_lineup, updated_opponent_lineup: player.final_lineup });

            // Check Win Con
            if (opponent.fuel <= 0) return endGame(gameId, connectedSockets.get(player.id), connectedSockets.get(opponent.id), "Fuel theft caused bankruptcy!");
            
            return advanceGameTurn(gameId, socket.id);
        }

        // --- CASE 2: ATTACKER IS A TRUCK (Standard Combat) ---
        const attackerTruck = attackerItem; // It's a truck
        const wasAttackerRevealedBeforeAttack = attackerTruck.revealed;
        
        // ... (Existing Combat Logic Below) ...
        let battleResult = {};

        if (targetItem) {
            // An attack is being made on a card, so reveal the attacker now.
            if (!wasAttackerRevealedBeforeAttack) {
                attackerTruck.revealed = true;
                io.to(gameId).emit('card-revealed', { truckId: attacker_truck_id, truckData: attackerTruck });
            }

            if (targetItem.type === 'truck') {
                if (!targetItem.revealed) {
                    targetItem.revealed = true;
                    io.to(gameId).emit('card-revealed', { truckId: target_truck_id, truckData: targetItem });
                }
                
                if (attackerTruck.final_hp > targetItem.final_hp) { // Attacker wins
                    const damage = attackerTruck.final_hp - targetItem.final_hp;
                    opponent.fuel -= damage;
                    battleResult = { loser_truck_id: target_truck_id, damage_dealt: damage };
                    opponent.final_lineup = opponent.final_lineup.filter(t => t.id !== target_truck_id);
                } else if (targetItem.final_hp > attackerTruck.final_hp) { // Opponent wins
                    const damage = targetItem.final_hp - attackerTruck.final_hp;
                    player.fuel -= damage;
                    battleResult = { loser_truck_id: attacker_truck_id, damage_dealt: damage };
                    player.final_lineup = player.final_lineup.filter(t => t.id !== attacker_truck_id);
                } else { // Tie
                    const damage = attackerTruck.final_hp;
                    player.fuel -= damage;
                    opponent.fuel -= damage;
                    battleResult = { tie: true, destroyed_trucks: [attacker_truck_id, target_truck_id], damage_dealt: damage };
                    player.final_lineup = player.final_lineup.filter(t => t.id !== attacker_truck_id);
                    opponent.final_lineup = opponent.final_lineup.filter(t => t.id !== target_truck_id);
                }
            } else if (targetItem.type === 'trap_card') {
                console.log(`Player ${opponent.id}'s trap card ${targetItem.name} was triggered by ${player.id}`);
                targetItem.revealed = true;
                io.to(gameId).emit('card-revealed', { truckId: targetItem.id, truckData: targetItem });

                const trapCard = targetItem.card;
                // User Rule: Player takes all damage from the attack when trap is hit
                const damage = attackerTruck.final_hp;
                opponent.fuel -= damage;

                battleResult = {
                    trap_activated: true,
                    trap_name: trapCard.name,
                    attacker_id: player.id,
                    defender_id: opponent.id,
                    damage_dealt: damage, // Use standard damage field
                    specific_effects: []
                };

                switch (trapCard.name) {
                    case 'Police':
                        // Effect: Destroys attacking truck if it was hidden
                        if (!wasAttackerRevealedBeforeAttack) {
                            battleResult.specific_effects.push({ type: 'text', message: `Police activated! The attacking truck is destroyed!` });
                            // Destroy attacker
                            player.final_lineup = player.final_lineup.filter(t => t.id !== attacker_truck_id);
                            battleResult.loser_truck_id = attacker_truck_id; // Signal destruction
                        } else {
                            battleResult.specific_effects.push({ type: 'text', message: `Police activated, but the attacker was visible!` });
                        }
                        // Effect: Reveal all defender trucks
                        opponent.final_lineup.forEach(item => {
                            if (item.type === 'truck' && !item.revealed) {
                                item.revealed = true;
                                io.to(gameId).emit('card-revealed', { truckId: item.id, truckData: item });
                            }
                        });
                        break;

                    case 'Fuel Thief':
                        // Effect: Steals Fuel (Simplified to flat 150 or look up logic)
                        // Use the JSON logic if possible, or fallback to flat amount
                        let stolenFuel = 150;
                        if (trapCard.effects) {
                             const amountEffect = trapCard.effects.find(e => e.type === 'steal_fuel')?.amounts?.find(amt => amt.class === attackerTruck.model.name);
                             if (amountEffect) stolenFuel = amountEffect.value;
                        }
                        opponent.fuel += stolenFuel;
                        player.fuel -= stolenFuel;
                        battleResult.specific_effects.push({ type: 'steal_fuel', stolenFuel: stolenFuel, fromPlayerId: player.id, toPlayerId: opponent.id });
                        break;

                    case 'Breakdown':
                        // Effect: Immobilizes attacker
                        attackerTruck.immobilized = true;
                        // Breakdown also usually has a cost, but here we focus on the main effect + damage taken
                        battleResult.specific_effects.push({ type: 'immobilize_truck', truckId: attacker_truck_id });
                        break;
                }

                // Destroy the trap card after use
                opponent.final_lineup = opponent.final_lineup.filter(t => t.id !== target_truck_id);
            }
        } else if (opponent.final_lineup.filter(i => i.type === 'truck').length === 0 && target_truck_id === "opponent_player_fuel") {
            // Direct attack on player, reveal attacker
            if (!wasAttackerRevealedBeforeAttack) {
                attackerTruck.revealed = true;
                io.to(gameId).emit('card-revealed', { truckId: attacker_truck_id, truckData: attackerTruck });
            }
            const directDamage = attackerTruck.final_hp;
            opponent.fuel -= directDamage;
            battleResult = { direct_damage_to_player: opponentId, damage_dealt: directDamage };
        } else {
            // Invalid target, so we revert the has_attacked_this_round status
            attackerTruck.has_attacked_this_round = false;
            return socket.emit('invalid-action', 'Target is not valid.');
        }

        const commonTurnResult = {
            ...battleResult,
            updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }
        };

        // Send personalized state to each player
        io.to(player.id).emit('turn-result', {
            ...commonTurnResult,
            updated_my_lineup: player.final_lineup,
            updated_opponent_lineup: opponent.final_lineup
        });

        io.to(opponent.id).emit('turn-result', {
            ...commonTurnResult,
            updated_my_lineup: opponent.final_lineup, // Swapped
            updated_opponent_lineup: player.final_lineup // Swapped
        });

        // Check for Game Over conditions
        if (opponent.fuel <= 0 && player.fuel <= 0) {
             return endGame(gameId, null, null, "¡Empate catastrófico! Ambos jugadores se quedaron sin combustible.");
        }
        if (opponent.fuel <= 0) {
            const winnerDiscordId = connectedSockets.get(player.id);
            const loserDiscordId = connectedSockets.get(opponent.id);
            return endGame(gameId, winnerDiscordId, loserDiscordId, "¡El combustible del oponente llegó a cero! Su empresa ha quebrado.");
        }
        if (player.fuel <= 0) {
            const winnerDiscordId = connectedSockets.get(opponent.id);
            const loserDiscordId = connectedSockets.get(player.id);
            return endGame(gameId, winnerDiscordId, loserDiscordId, "¡Tu combustible llegó a cero! Tu empresa ha quebrado.");
        }

        advanceGameTurn(gameId, socket.id);
    });

    socket.on('pass-turn', () => {
        if (gameState.status !== 'battle' || socket.id !== gameState.current_turn) {
            return; // Ignore if it's not their turn or not in battle
        }
        gameState.passCounter++; // Increment pass counter
        console.log(`Player ${socket.id} passed their turn for game ${gameId}. Pass count: ${gameState.passCounter}`);
        advanceGameTurn(gameId, socket.id);
    });

    const advanceGameTurn = (gameId, lastPlayerSocketId) => {
        const game = activeGames.get(gameId);
        if (!game) return;
        const { gameState, connectedSockets } = game;

        const lastPlayer = gameState.players[lastPlayerSocketId];
        if (lastPlayer && lastPlayer.hand && lastPlayer.hand.trap_cards.length > 0) {
            lastPlayer.hand.trap_cards = [];
        }
    
        // Check if ALL trucks on BOTH sides have either attacked or are immobilized
        const allTrucksFinished = Object.values(gameState.players).every(p => {
             const trucks = p.final_lineup.filter(item => item.type === 'truck');
             if (trucks.length === 0) return true; // Player has no trucks, so they are "finished"
             return trucks.every(truck => truck.has_attacked_this_round || truck.immobilized);
        });

        // New condition: if both players passed consecutively or all trucks have attacked
        if (allTrucksFinished || gameState.passCounter >= 2) {
            console.log(`End of Round ${gameState.current_round}. All trucks finished: ${allTrucksFinished}, Pass count: ${gameState.passCounter}`);
            gameState.passCounter = 0; // Reset for next round
            gameState.current_round++;
            
            // --- ROTATE TURN ORDER FOR NEW ROUND ---
            // Move the first player to the end of the array
            gameState.turn_order.push(gameState.turn_order.shift());
            // Explicitly set the current turn to the NEW first player
            gameState.current_turn = gameState.turn_order[0];
            console.log(`New Round ${gameState.current_round} starting. Turn order rotated. New starter: ${gameState.current_turn}`);

            if (gameState.current_round > gameState.max_rounds) {
                const p1 = gameState.players[gameState.turn_order[0]];
                const p2 = gameState.players[gameState.turn_order[1]];
                let winnerDiscordId = null;
                let loserDiscordId = null;
                let reason = "";

                if (p1.fuel > p2.fuel) {
                    winnerDiscordId = connectedSockets.get(p1.id);
                    loserDiscordId = connectedSockets.get(p2.id);
                    reason = "You had more fuel remaining!";
                } else if (p2.fuel > p1.fuel) { 
                    winnerDiscordId = connectedSockets.get(p2.id);
                    loserDiscordId = connectedSockets.get(p1.id);
                    reason = "You had more fuel remaining!";
                } else {
                    reason = "The game is a draw (Equal Fuel)!";
                }
                return endGame(gameId, winnerDiscordId, loserDiscordId, reason);
            }

            gameState.status = 'replenishing';
            Object.keys(gameState.players).forEach(id => gameState.player_ready_status[id] = false);

            Object.values(gameState.players).forEach(p => {
                // At the end of the round, remove any trap cards that were not triggered.
                p.final_lineup = p.final_lineup.filter(item => item.type !== 'trap_card');

                p.final_lineup.forEach(item => { if (item.type === 'truck') item.has_attacked_this_round = false; });
                drawHand(gameId, p.id);
                io.to(p.id).emit('start-replenishment', {
                    round: gameState.current_round,
                    new_hand: p.hand,
                    surviving_lineup: p.final_lineup
                });
            });
        } else {
            // Advance to next player
            const nextPlayerId = gameState.turn_order.find(id => id !== gameState.current_turn);
            gameState.current_turn = nextPlayerId;
            io.to(gameId).emit('next-turn', { next_turn: gameState.current_turn, round: gameState.current_round });
            
            const nextPlayer = gameState.players[nextPlayerId];
            
            // Improved "Can Attack" check
            const trucks = nextPlayer.final_lineup.filter(item => item.type === 'truck');
            const hasMobileTrucks = trucks.some(item => !item.immobilized && !item.has_attacked_this_round);
            
            // Check if player has Trap Cards in hand (and it's not Round 1 setup, implied by status='battle')
            const hasTrapCardsInHand = nextPlayer.hand && nextPlayer.hand.trap_cards && nextPlayer.hand.trap_cards.length > 0;

            // Player can move if they have trucks to attack OR trap cards to play
            const canAct = (trucks.length > 0 && hasMobileTrucks) || hasTrapCardsInHand;

            if (!canAct) {
                console.log(`Player ${nextPlayerId} has no valid moves (Trucks: ${trucks.length}, Mobile: ${hasMobileTrucks}, Traps: ${hasTrapCardsInHand}). Auto-passing.`);
                // We do NOT increment passCounter here to avoid infinite loops if both are stuck, 
                // instead we rely on the check at the start of advanceGameTurn.
                // However, we need to signal that a turn passed.
                gameState.passCounter++;
                
                // IMPORTANT: Recursive call to keep skipping turns until round ends or someone can play
                // Add a small delay to avoid stack overflow in tight loops and allow client to see updates
                setTimeout(() => advanceGameTurn(gameId, nextPlayerId), 500); 
            } else {
                // Reset pass counter if a player CAN move
                gameState.passCounter = 0; 
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
                    endGame(gameId, opponentDiscordId, discordId, "El oponente se desconectó. Ganaste por abandono.");
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

// --- Local Development Quick Start ---
const setupLocalDevGame = () => {
    const devGameId = 'local-dev-game';
    const player1Id = 'player1';
    const player2Id = 'player2';

    console.log('--- LOCAL DEVELOPMENT MODE ---');
    
    // Clear any previous instance of this dev game
    if (activeGames.has(devGameId)) {
        activeGames.delete(devGameId);
    }

    activeGames.set(devGameId, {
        gameState: {
            players: {}, status: 'waiting_for_players_to_connect', turn_order: [],
            active_environment: null,
            current_turn: null, current_round: 1, max_rounds: 3,
            player_ready_status: {},
            passCounter: 0
        },
        discordPlayers: {
            [player1Id]: { socketId: null, discordId: player1Id },
            [player2Id]: { socketId: null, discordId: player2Id }
        },
        channelId: 'local-dev-channel',
        connectedSockets: new Map()
    });

    const player1Url = `${CLIENT_BASE_URL}/?gameId=${devGameId}&playerId=${player1Id}`;
    const player2Url = `${CLIENT_BASE_URL}/?gameId=${devGameId}&playerId=${player2Id}`;

    console.log('Game for local development created.');
    console.log('Copy and open these URLs in two separate browser tabs:');
    console.log(`Player 1: ${player1Url}`);
    console.log(`Player 2: ${player2Url}`);
    console.log('---------------------------------');
};

setupLocalDevGame(); // Initialize the local dev game on startup

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
