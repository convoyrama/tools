const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');

const app = express();
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

const PORT = process.env.PORT || 3000;

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

// --- 2. Gestión del Estado del Juego ---
let gameState = {};
let waitingPlayers = [];

const resetGameState = () => {
    gameState = {
        players: {}, status: 'waiting', turn_order: [],
        active_environment: null,
        current_turn: null, current_round: 1, max_rounds: 3,
        player_ready_status: {}
    };
    waitingPlayers = [];
    console.log("Game state reset.");
};

resetGameState(); // Initialize state on server start

// --- 3. Funciones de Utilidad y Validación ---
const shuffleDeck = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};

const drawHand = (player) => {
    player.hand = { models: [], engines: [], chassis: [], trap_cards: [] };
    // Draw 5 of each regular card type
    ['models', 'engines', 'chassis'].forEach(type => {
        for (let i = 0; i < 5; i++) {
            if (player.decks[type].length === 0) {
                if (player.discard_piles[type].length === 0) {
                    // Reshuffle discard into deck if both are empty
                    if (gameData[type] && gameData[type].length > 0) { // Check if original gameData has cards for this type
                        player.decks[type] = shuffleDeck(JSON.parse(JSON.stringify(gameData[type])));
                    } else {
                        break; // No cards to draw
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
    // Draw trap cards only from Round 2 onwards
    if (gameState.current_round > 1) {
        const trapCardType = 'trap_cards';
        for (let i = 0; i < 2; i++) { // Draw 2 trap cards
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
const endGame = (winnerId, loserId, reason) => {
    if (winnerId) io.to(winnerId).emit('game-over', { winner: true, message: reason });
    if (loserId) io.to(loserId).emit('game-over', { winner: false, message: reason });
    console.log(`Game over. Winner: ${winnerId}. Reason: ${reason}`);
    resetGameState();
};

const startGame = () => {
    if (waitingPlayers.length < 2) return;
    
    const playerSockets = waitingPlayers.splice(0, 2);
    
    resetGameState();
    gameState.status = 'setup';

    gameState.turn_order = [playerSockets[0].id, playerSockets[1].id];

    playerSockets.forEach(pSocket => {
        gameState.players[pSocket.id] = {
            id: pSocket.id, fuel: 0,
                            decks: {
                                models: shuffleDeck(JSON.parse(JSON.stringify(gameData.models))),
                                engines: shuffleDeck(JSON.parse(JSON.stringify(gameData.engines))),
                                chassis: shuffleDeck(JSON.parse(JSON.stringify(gameData.chassis))),
                                trap_cards: shuffleDeck(JSON.parse(JSON.stringify(gameData.trap_cards))), // Add trap_cards deck
                            },            hand: { models: [], engines: [], chassis: [], trap_cards: [] },
            discard_piles: { models: [], engines: [], chassis: [] },
            submitted_lineup: null, final_lineup: []
        };
        gameState.player_ready_status[pSocket.id] = false;
        drawHand(gameState.players[pSocket.id]);
    });
    
    playerSockets.forEach(pSocket => {
        io.to(pSocket.id).emit('game-start', {
            players: Object.keys(gameState.players),
            round: gameState.current_round,
            myState: gameState.players[pSocket.id]
        });
    });
    console.log(`Game started. Round ${gameState.current_round}. Waiting for players to assemble their convoy.`);
};

// --- 5. Conexiones y Eventos del Socket ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    if (waitingPlayers.length < 2 && gameState.status === 'waiting') {
        waitingPlayers.push(socket);
        if (waitingPlayers.length === 2) startGame();
    } else {
        socket.emit('server-full', 'Server full.');
        socket.disconnect();
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
        
        // --- Calculate Fuel based on deployed chassis ---
        let calculatedFuel = 0;
        submittedTrucks.forEach(truck => {
            if (truck.chassis && truck.chassis.fuel_capacity !== undefined) {
                calculatedFuel += truck.chassis.fuel_capacity;
            }
        });

        // If replenishing, add to existing fuel, otherwise set as initial fuel
        if (gameState.status === 'replenishing') {
            player.fuel += calculatedFuel; // Add new fuel from newly added chassis
        } else { // 'setup' phase
            player.fuel = calculatedFuel; // Set initial fuel
        }
        console.log(`Player ${socket.id} submitted lineup. Calculated Fuel: ${player.fuel}`); // Log for debugging
        // --- End Fuel Calculation ---

        // Process Trucks
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
        console.log(`Player ${socket.id} has confirmed their fleet of ${finalSubmittedLineup.length} items. Current Fuel: ${player.fuel}`); // Added fuel log

        if (Object.values(gameState.player_ready_status).every(s => s)) {
            console.log("Both players ready. Starting battle.");
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
                    name: item.revealed ? item.name : undefined,
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

    // NEW: socket.on('play-trap-card') handler
    socket.on('play-trap-card', ({ trapCardName, targetId }) => {
        const player = gameState.players[socket.id];
        const opponentId = gameState.turn_order.find(id => id !== socket.id); // Get opponent ID
        const opponent = gameState.players[opponentId]; // Get opponent object

        if (!player || !player.hand || !player.hand.trap_cards) {
            return socket.emit('invalid-action', `Player data or hand is invalid for playing trap card.`);
        }

        const playedTrapCardIndex = player.hand.trap_cards.findIndex(card => card.name === trapCardName);
        if (playedTrapCardIndex === -1) {
            return socket.emit('invalid-action', `Trap card "${trapCardName}" not found in hand.`);
        }

        // Remove the played trap card from hand (it's "destroyed")
        const playedTrapCard = player.hand.trap_cards.splice(playedTrapCardIndex, 1)[0];
        console.log(`Player ${socket.id} played trap card: ${playedTrapCard.name}. Target: ${targetId}`);

        // --- Apply Trap Card Effects ---
        if (playedTrapCard.effects && Array.isArray(playedTrapCard.effects)) {
            playedTrapCard.effects.forEach(effect => {
                switch (effect.type) {
                    case 'steal_fuel':
                        if (effect.target === 'opponent_truck' && targetId) {
                            const targetTruck = opponent.final_lineup.find(item => item.id === targetId && item.type === 'truck');
                            if (targetTruck && effect.amounts) {
                                const amountEffect = effect.amounts.find(amt => amt.class === targetTruck.model.name); // Assuming model.name is the class
                                if (amountEffect) {
                                    const stolenFuel = amountEffect.value;
                                    opponent.fuel -= stolenFuel;
                                    player.fuel += stolenFuel;
                                    io.emit('turn-result', {
                                        message: `${player.id} stole ${stolenFuel} Fuel from ${opponent.id}!`,
                                        updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }
                                    });
                                    console.log(`Fuel Thief: ${player.id} stole ${stolenFuel} from ${opponent.id}.`);
                                }
                            }
                        }
                        break;
                    case 'reveal_own_truck':
                        // Find a random hidden truck of the current player and reveal it
                        const hiddenTrucks = player.final_lineup.filter(item => item.type === 'truck' && !item.revealed);
                        if (hiddenTrucks.length > 0) {
                            const truckToReveal = hiddenTrucks[Math.floor(Math.random() * hiddenTrucks.length)];
                            truckToReveal.revealed = true;
                            io.emit('card-revealed', { truckId: truckToReveal.id, truckData: truckToReveal });
                            console.log(`Reveal Own Truck: ${player.id}'s truck ${truckToReveal.model.name} revealed.`);
                        }
                        break;
                    case 'immobilize_truck':
                        if (effect.target === 'opponent_truck' && targetId) {
                            const targetTruck = opponent.final_lineup.find(item => item.id === targetId && item.type === 'truck');
                            if (targetTruck) {
                                targetTruck.immobilized = true;
                                io.emit('turn-result', { message: `${targetTruck.model.name} is immobilized!`, updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }, updated_my_lineup: player.final_lineup, updated_opponent_lineup: opponent.final_lineup }); // Send updated lineups
                                console.log(`Breakdown: ${targetTruck.model.name} immobilized.`);
                            }
                        }
                        break;
                    case 'lose_fuel':
                        if (effect.target === 'self') {
                            player.fuel -= effect.value;
                            io.emit('turn-result', { message: `${player.id} lost ${effect.value} Fuel!`, updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel } });
                            console.log(`Lose Fuel: ${player.id} lost ${effect.value} Fuel.`);
                        }
                        break;
                    case 'destroy_truck':
                        if (effect.target === 'opponent_truck_hidden' && targetId) {
                            const targetTruckIndex = opponent.final_lineup.findIndex(item => item.id === targetId && item.type === 'truck' && !item.revealed);
                            if (targetTruckIndex !== -1) {
                                const destroyedTruck = opponent.final_lineup.splice(targetTruckIndex, 1)[0];
                                opponent.fuel -= 100; // Arbitrary fuel loss for destruction
                                io.emit('turn-result', {
                                    message: `${destroyedTruck.model.name} was destroyed by Police!`,
                                    loser_truck_id: destroyedTruck.id,
                                    damage_dealt: 100, // Send damage dealt for fuel loss
                                    updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel },
                                    updated_my_lineup: player.final_lineup, updated_opponent_lineup: opponent.final_lineup
                                });
                                console.log(`Police: ${destroyedTruck.model.name} destroyed.`);
                            }
                        }
                        break;
                    case 'reveal_all_self':
                        player.final_lineup.forEach(item => {
                            if (item.type === 'truck' && !item.revealed) {
                                item.revealed = true;
                                io.emit('card-revealed', { truckId: item.id, truckData: item }); // Client needs to handle this
                            }
                        });
                        console.log(`Police: All of ${player.id}'s trucks revealed.`);
                        break;
                }
            });
        }
        // --- End Apply Trap Card Effects ---

        // After effect is applied, advance turn
        advanceGameTurn(socket.id);
    });

    socket.on('attack', ({ attacker_truck_id, target_truck_id }) => {
        console.log(`Attack event received from ${socket.id}. Attacker: ${attacker_truck_id}, Target: ${target_truck_id}`);
        if (gameState.status !== 'battle' || socket.id !== gameState.current_turn) {
            console.log(`Invalid attack: Not battle status or not current turn. Status: ${gameState.status}, Turn: ${gameState.current_turn}, Player: ${socket.id}`);
            return;
        }

        const player = gameState.players[socket.id];
        const opponentId = gameState.turn_order.find(id => id !== socket.id);
        const opponent = gameState.players[opponentId];
        
        const attackerTruck = player.final_lineup.find(t => t.id === attacker_truck_id && t.type === 'truck');

        if (!attackerTruck) {
            console.log(`Invalid attack: Attacker truck ${attacker_truck_id} not found for player ${socket.id}.`);
            return socket.emit('invalid-action', 'Attacker truck is not valid.');
        }
        if (attackerTruck.has_attacked_this_round) {
            console.log(`Invalid attack: Attacker truck ${attacker_truck_id} already attacked.`);
            return socket.emit('invalid-action', 'This truck has already attacked.');
        }
        if (attackerTruck.immobilized) {
            console.log(`Invalid attack: Attacker truck ${attacker_truck_id} is immobilized.`);
            return socket.emit('invalid-action', 'This truck is immobilized.');
        }

        attackerTruck.has_attacked_this_round = true;
        console.log(`Attacker truck ${attacker_truck_id} marked as attacked this round.`);
        if (!attackerTruck.revealed) {
            attackerTruck.revealed = true;
            io.emit('card-revealed', { truckId: attacker_truck_id, truckData: attackerTruck });
            console.log(`Emitting card-revealed for attacker ${attacker_truck_id}.`);
        }

        const targetItem = opponent.final_lineup.find(t => t.id === target_truck_id);

        if (targetItem) {
            console.log(`Target found: ${targetItem.id}. Type: ${targetItem.type}.`);
            if (targetItem.type === 'truck') {
                if (!targetItem.revealed) {
                    targetItem.revealed = true;
                    io.emit('card-revealed', { truckId: target_truck_id, truckData: targetItem });
                    console.log(`Emitting card-revealed for target ${target_truck_id}.`);
                }
                const damage = Math.abs(attackerTruck.final_hp - targetItem.final_hp);
                let battleResult = {};

                if (attackerTruck.final_hp >= targetItem.final_hp) {
                    console.log(`Attacker (${attackerTruck.final_hp}) >= Target (${targetItem.final_hp}). Opponent ${opponent.id} loses ${damage} fuel.`);
                    opponent.fuel -= damage;
                    opponent.final_lineup = opponent.final_lineup.filter(t => t.id !== target_truck_id);
                    battleResult = { loser_truck_id: target_truck_id, damage_dealt: damage };
                } else {
                    console.log(`Attacker (${attackerTruck.final_hp}) < Target (${targetItem.final_hp}). Player ${player.id} loses ${damage} fuel.`);
                    player.fuel -= damage;
                    player.final_lineup = player.final_lineup.filter(t => t.id !== attacker_truck_id);
                    battleResult = { loser_truck_id: attacker_truck_id, damage_dealt: damage };
                }
                io.emit('turn-result', { ...battleResult, updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel }, updated_my_lineup: player.final_lineup, updated_opponent_lineup: opponent.final_lineup });
                console.log(`Emitting turn-result after truck battle. Player Fuel: ${player.fuel}, Opponent Fuel: ${opponent.fuel}`);
            }
        } else if (opponent.final_lineup.filter(i => i.type === 'truck').length === 0 && target_truck_id === "opponent_player_fuel") { // Added target_truck_id check
            console.log(`Direct attack on opponent's fuel. Attacker HP: ${attackerTruck.final_hp}`);
            const directDamage = attackerTruck.final_hp;
            opponent.fuel -= directDamage;
            io.emit('turn-result', {
                direct_damage_to_player: opponentId,
                damage_dealt: directDamage,
                updated_fuel: { [player.id]: player.fuel, [opponent.id]: opponent.fuel },
                updated_my_lineup: player.final_lineup, updated_opponent_lineup: opponent.final_lineup
            });
            console.log(`Emitting turn-result after direct fuel attack. Player Fuel: ${player.fuel}, Opponent Fuel: ${opponent.fuel}`);
        } else {
            console.log(`Invalid target: ${target_truck_id}. No trucks in opponent's lineup or target is not opponent_player_fuel.`);
            return socket.emit('invalid-action', 'Target is not valid.');
        }

        if (opponent.fuel <= 0) {
            console.log(`Opponent fuel (${opponent.fuel}) <= 0. Ending game.`);
            return endGame(player.id, opponent.id, "Opponent's Fuel reached zero.");
        }
        if (player.fuel <= 0) {
            console.log(`Player fuel (${player.fuel}) <= 0. Ending game.`);
            return endGame(opponent.id, player.id, "Player's Fuel reached zero.");
        }

        advanceGameTurn(socket.id);
        console.log(`Advancing turn after attack.`);
    });

    const advanceGameTurn = (lastPlayerId) => {
        // Remove unused trap cards from the last player's hand (if any)
        const lastPlayer = gameState.players[lastPlayerId];
        if (lastPlayer && lastPlayer.hand && lastPlayer.hand.trap_cards.length > 0) {
            console.log(`Player ${lastPlayerId}: Unused trap cards (${lastPlayer.hand.trap_cards.map(tc => tc.name).join(', ')}) discarded.`);
            lastPlayer.hand.trap_cards = [];
        }
    
        const allTrucksAttacked = Object.values(gameState.players).every(p =>            p.final_lineup.filter(item => item.type === 'truck' && !item.immobilized).every(truck => truck.has_attacked_this_round)
        );

        if (allTrucksAttacked) {
            console.log(`End of Round ${gameState.current_round}.`);
            gameState.current_round++;
            gameState.turn_order.push(gameState.turn_order.shift());

            if (gameState.current_round > gameState.max_rounds) {
                const p1 = gameState.players[gameState.turn_order[0]];
                const p2 = gameState.players[gameState.turn_order[1]];
                if (p1.fuel > p2.fuel) return endGame(p1.id, p2.id, "More Fuel at the end.");
                if (p2.fuel > p1.fuel) return endGame(p2.id, p1.id, "More Fuel at the end.");
                return endGame(null, null, "The game is a draw!");
            }

            gameState.status = 'replenishing';
            Object.keys(gameState.players).forEach(id => gameState.player_ready_status[id] = false);

            Object.values(gameState.players).forEach(p => {
                p.final_lineup.forEach(item => {
                    if (item.type === 'truck') {
                        item.has_attacked_this_round = false;
                    }
                });
                drawHand(p);
                io.to(p.id).emit('start-replenishment', {
                    round: gameState.current_round,
                    new_hand: p.hand,
                    surviving_lineup: p.final_lineup
                });
            });
            console.log(`Starting replenishment for Round ${gameState.current_round}.`);
        } else {
            const nextPlayerId = gameState.turn_order.find(id => id !== gameState.current_turn);
            gameState.current_turn = nextPlayerId;
            io.emit('next-turn', { next_turn: gameState.current_turn, round: gameState.current_round });
            
            // Check if the new player can make a move. If not, advance turn again.
            const nextPlayer = gameState.players[nextPlayerId];
            const canAttack = nextPlayer.final_lineup.some(item => item.type === 'truck' && !item.immobilized && !item.has_attacked_this_round);

            if (!canAttack) {
                console.log(`Player ${nextPlayerId} has no valid moves. Advancing turn automatically.`);
                // Mark their non-existent trucks as "attacked" to satisfy the end-of-round condition
                nextPlayer.final_lineup.forEach(item => {
                    if (item.type === 'truck') {
                        item.has_attacked_this_round = true;
                    }
                });
                // Use a small delay to prevent a tight, blocking loop in the rare case both players get stuck
                setTimeout(() => advanceGameTurn(nextPlayerId), 500); 
            }
        }
    };

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id);
        if (gameState.players[socket.id]) {
             const opponentId = gameState.turn_order.find(id => id !== socket.id);
             if (opponentId) endGame(opponentId, socket.id, "Opponent disconnected.");
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
