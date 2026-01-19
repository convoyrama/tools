import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { socket } from './services/socket';
import './App.css';
import Hand from './components/Hand'; // Import the Hand component
import Card from './components/Card'; // Import the Card component

// --- Interfaces ---
interface TruckCardData { name: string; compatible_engine_classes: string[]; compatible_chassis_classes: string[]; }
interface EngineCardData { name: string; hp: number; class: string; }
interface ChassisCardData { name: string; classes: string[]; fuel_capacity?: number; }
interface PlayerHand { engines: EngineCardData[]; chassis: ChassisCardData[]; trap_cards: TrapCardData[]; }
interface TrapCardData { name: string; description: string; effects: any[]; }

// Item that can be deployed onto the field - Moved from Hand.tsx
export type DeployableItem = {
    type: 'truck';
    model: TruckCardData;
    engine: EngineCardData;
    chassis: ChassisCardData;
    id: string; // Add ID for tracking in App.tsx
} | {
    type: 'trap_card';
    card: TrapCardData;
    id: string; // Add ID for tracking in App.tsx
};

type DeployedItem = {
    type: 'truck';
    model: TruckCardData;
    engine: EngineCardData;
    chassis: ChassisCardData;
    id: string; // Add ID for tracking
    final_hp: number; // Truck specific
    revealed: boolean;
    immobilized: boolean; // Add immobilized status
    has_attacked_this_round: boolean;
} | {
    type: 'trap_card';
    card: TrapCardData;
    id: string; // Add ID for tracking
    revealed: boolean;
    immobilized: boolean; // Trap cards can also be immobilized
    name: string; // For display when revealed
};

interface GameState { status: string; current_round: number; active_environment?: any; }



type FinalLineupItem = DeployedItem; // The actual type of items in final_lineup

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameClientHand, setGameClientHand] = useState<PlayerHand | null>(null);
  const [playerFuel, setPlayerFuel] = useState<number>(0); // Renamed from playerLP
  const [opponentFuel, setOpponentFuel] = useState<number>(0); // Renamed from opponentLP
  const [myFinalLineup, setMyFinalLineup] = useState<FinalLineupItem[]>([]); // Changed to FinalLineupItem[]
  const [opponentFinalLineup, setOpponentFinalLineup] = useState<FinalLineupItem[]>([]); // Changed to FinalLineupItem[]
  const [myTurn, setMyTurn] = useState<boolean>(false);
  const [gameMessage, setGameMessage] = useState<string>('');
  const [destructionMessage, setDestructionMessage] = useState<string | null>(null); // New state for destruction messages
  const [endgameMessage, setEndgameMessage] = useState<string | null>(null); // New state for endgame messages
  const [playerWon, setPlayerWon] = useState<boolean | null>(null);
  const [blinkingPlayer, setBlinkingPlayer] = useState<string | null>(null); // 'self' or 'opponent'
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [zoomedCard, setZoomedCard] = useState<any | null>(null); // State for zoomed card
  // States for card selection from hand
  const [selectedHandEngine, setSelectedHandEngine] = useState<EngineCardData | null>(null);
  const [selectedHandChassis, setSelectedHandChassis] = useState<ChassisCardData | null>(null);
  const [selectedHandTrapCard, setSelectedHandTrapCard] = useState<TrapCardData | null>(null);
  const [isWaiting, setIsWaiting] = useState<boolean>(false); // New state to track waiting status

  // Refs to hold the latest state for use in socket event handlers, avoiding stale closures
  const myFinalLineupRef = useRef(myFinalLineup);
  myFinalLineupRef.current = myFinalLineup;
  const opponentFinalLineupRef = useRef(opponentFinalLineup);
  opponentFinalLineupRef.current = opponentFinalLineup;

  const canAttack = useMemo(() => {
    // A player can attack if they have at least one truck that hasn't attacked and isn't immobilized.
    return myFinalLineup.some(item => item.type === 'truck' && !item.has_attacked_this_round && !item.immobilized);
  }, [myFinalLineup]);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('gameId');
    const playerId = params.get('playerId');

    if (!gameId || !playerId) {
      setGameMessage("Error: Missing gameId or playerId in the URL. Please use the link provided by the bot.");
      return;
    }
    
    // Set query parameters before connecting
    socket.io.opts.query = { gameId, playerId };

    // --- Event Handlers ---
    function onConnect() { setIsConnected(true); console.log('Connected!'); }
    function onDisconnect() { setIsConnected(false); console.log('Disconnected.'); }

    function onGameStart(data: any) {
      console.log('EVENT: game-start', data);
      setGameState({ status: 'setup', current_round: data.round });
      // myState.hand already includes trap_cards
      setGameClientHand(data.myState.hand);
      setPlayerFuel(data.myState.fuel);
      setOpponentFuel(data.myState.fuel); // Initialize opponent's fuel
      setMyTurn(false); // No one's turn during setup
      setGameMessage(`Game started! Assemble your convoy.`);
      setMyFinalLineup([]); // Clear lineup on game start
      setOpponentFinalLineup([]); // Clear lineup on game start
      setIsWaiting(false); // Reset waiting
    }

    function onBattleStart(data: any) {
      console.log(`[${socket.id}] EVENT: battle-start`, data);
      const isMyTurn = data.turn === socket.id;
      console.log(`[${socket.id}] It is my turn: ${isMyTurn}`);

      setGameState(prev => ({ ...(prev!), status: 'battle', active_environment: data.environment }));
      setMyFinalLineup(data.my_final_lineup);
      setOpponentFinalLineup(data.opponent_final_lineup);
      setMyTurn(isMyTurn);
      setGameMessage(`Battle started! It's ${isMyTurn ? 'your' : 'opponent\'s'} turn.`);
      setIsWaiting(false); // Ensure waiting is off when battle starts
    }
    
    function onCardRevealed({ truckId, truckData }: { truckId: string, truckData: FinalLineupItem }) { // truckData is now FinalLineupItem
        console.log('EVENT: card-revealed', truckId, truckData);
        setOpponentFinalLineup(prevLineup =>
            prevLineup.map(item => (item.id === truckId ? { ...item, ...truckData, revealed: true } : item)) // Update revealed status and data
        );
    }

    function onNextTurn(data: any) {
      console.log(`[${socket.id}] EVENT: next-turn`, data);
      const isMyTurn = data.next_turn === socket.id;
      console.log(`[${socket.id}] It is my turn: ${isMyTurn}`);

      setMyTurn(isMyTurn);
      setGameState(prev => ({...(prev!), current_round: data.round}));
      setGameMessage(`Round ${data.round}. It's ${isMyTurn ? 'your' : 'opponent\'s'} turn.`);
      setSelectedAttackerId(null);
      setSelectedTargetId(null);

      // NEW: Reset has_attacked_this_round for all trucks in myFinalLineup
      setMyFinalLineup(prevLineup =>
        prevLineup.map(item =>
          item.type === 'truck' ? { ...item, has_attacked_this_round: false } : item
        )
      );
    }

    function onTurnResult(data: any) {
      console.log('EVENT: turn-result', data);
      // Always update fuel first
      setPlayerFuel(data.updated_fuel[socket.id as string]);
      const opponentId = Object.keys(data.updated_fuel).find(id => id !== socket.id);
      if (opponentId) setOpponentFuel(data.updated_fuel[opponentId]);

      // Always accept the server's state of the lineups as the source of truth
      if (data.updated_my_lineup) {
        setMyFinalLineup(data.updated_my_lineup);
      }
      if (data.updated_opponent_lineup) {
        setOpponentFinalLineup(data.updated_opponent_lineup);
      }

      // Then, set the message based on the event type
      if (data.tie) {
          setBlinkingPlayer('both');
          setDestructionMessage(`¡Choque de camiones! Ambos vehículos son destruidos y ambos jugadores pierden ${data.damage_dealt} de combustible.`);
      } else if (data.direct_damage_to_player) {
          const targetPlayer = data.direct_damage_to_player === socket.id ? "self" : "opponent";
          setBlinkingPlayer(targetPlayer);
          setDestructionMessage(`¡Golpe directo! El combustible ${targetPlayer === 'self' ? 'tuyo' : "del oponente"} recibe ${data.damage_dealt} de daño.`);
      } else if (data.loser_truck_id) {
          // Find out who lost for the message
          const myDestroyedItem = myFinalLineupRef.current.find(t => t.id === data.loser_truck_id);
          if (myDestroyedItem) { // My truck was in the original lineup, but is now gone from the new one
              setBlinkingPlayer('self');
              setDestructionMessage(`¡Tu camión fue destruido! Pierdes ${data.damage_dealt} de combustible.`);
          } else {
              setBlinkingPlayer('opponent');
              setDestructionMessage(`¡El camión del oponente fue destruido! Él pierde ${data.damage_dealt} de combustible.`);
          }
      }
    }
    
    function onStartReplenishment(data: any) {
        console.log('EVENT: start-replenishment', data);
        setGameState(prev => ({ ...(prev!), status: 'replenishing', current_round: data.round, active_environment: data.environment })); // Update environment
        setMyFinalLineup(data.surviving_lineup);
        setGameClientHand(data.new_hand);
        setOpponentFinalLineup([]); // Clear opponent's board for the new round
        setGameMessage(`End of round. Replenish your lineup for round ${data.round}.`);
        setIsWaiting(false); // Reset waiting for next round setup
    }

    function onGameOver(data: any) {
      const prefix = data.winner ? "You Won!" : "You Lost!";
      let messageSuffix = data.message; // Default to server message

      // Removed client-side override for loss message. Server's message is now authoritative.

      setEndgameMessage(`${prefix} ${messageSuffix}`);
      setPlayerWon(data.winner);
      setGameMessage('');
      setIsConnected(false);
    }

    function onInvalidAction(message: string) {
      console.warn('EVENT: invalid-action', message);
      setGameMessage(`Invalid Action: ${message}. Try again.`);
      setMyTurn(true); // Give the turn back to the player
    }

    function onConnectionError(message: string) {
        setGameMessage(`Connection Error: ${message}. The game cannot start.`);
        setIsConnected(false);
    }

    function onFuelUpdated(data: any) {
      console.log('EVENT: fuel-updated', data);
      setPlayerFuel(data[socket.id as string]);
      const opponentId = Object.keys(data).find(id => id !== socket.id);
      if (opponentId) {
        setOpponentFuel(data[opponentId]);
      }
    }

    // --- Register Listeners ---
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game-start', onGameStart);
    socket.on('battle-start', onBattleStart);
    socket.on('card-revealed', onCardRevealed);
    socket.on('next-turn', onNextTurn);
    socket.on('turn-result', onTurnResult);
    socket.on('fuel-updated', onFuelUpdated); // Register new listener
    socket.on('start-replenishment', onStartReplenishment);
    socket.on('game-over', onGameOver);
    socket.on('invalid-action', onInvalidAction);
    socket.on('connection-error', onConnectionError);
    socket.connect();

    return () => {
      // --- Unregister Listeners ---
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game-start', onGameStart);
      socket.off('battle-start', onBattleStart);
      socket.off('card-revealed', onCardRevealed);
      socket.off('next-turn', onNextTurn);
      socket.off('turn-result', onTurnResult);
      socket.off('fuel-updated', onFuelUpdated); // Unregister new listener
      socket.off('start-replenishment', onStartReplenishment);
      socket.off('game-over', onGameOver);
      socket.off('invalid-action', onInvalidAction);
      socket.off('connection-error', onConnectionError);
      socket.disconnect();
    };
  }, []);

  // Effect for destruction message timeout
  useEffect(() => {
    if (destructionMessage) {
        const timer = setTimeout(() => {
            setDestructionMessage(null);
        }, 3000); // Message disappears after 3 seconds
        return () => clearTimeout(timer);
    }
  }, [destructionMessage]);

  // Effect for blinking fuel timeout
  useEffect(() => {
    if (blinkingPlayer) {
      const timer = setTimeout(() => {
        setBlinkingPlayer(null);
      }, 1000); // Animation is 0.5s and runs twice
      return () => clearTimeout(timer);
    }
  }, [blinkingPlayer]);
  
  // --- Player Actions ---
  const handleAttack = () => {
    if (!myTurn || !selectedAttackerId) return;

    // Optimistic UI update to immediately remove glow
    setMyFinalLineup(prev => prev.map(t => 
        t.id === selectedAttackerId ? { ...t, has_attacked_this_round: true } : t
    ));

    let targetIdToSend = selectedTargetId;
    // Removed logic that converted "opponent_player_fuel" to null.
    // The server explicitly checks for the string "opponent_player_fuel".
    socket.emit('attack', { attacker_truck_id: selectedAttackerId, target_truck_id: targetIdToSend });
    setMyTurn(false);
    setGameMessage('Attacking...');
    setSelectedAttackerId(null);
    setSelectedTargetId(null);
  };

  const handlePassTurn = () => {
    if (!myTurn) return;
    socket.emit('pass-turn');
    setMyTurn(false);
    setGameMessage('Passing turn...');
  };



  const onLineupReady = (lineup: DeployableItem[]) => {
      socket.emit('player-ready-with-lineup', lineup);
      setGameMessage('Lineup submitted! Waiting for opponent...');
      // Do NOT clear hand here, as we need it for playing trap cards in battle
      // setGameClientHand(null); 
      setSelectedHandEngine(null);
      setSelectedHandChassis(null);
      setSelectedHandTrapCard(null);
      setIsWaiting(true); // Enable waiting mode to hide setup UI
  };

  const handleHandCardSelected = useCallback((card: any, type: string) => {
    if (type === 'clear') {
        setSelectedHandEngine(null);
        setSelectedHandChassis(null);
        setSelectedHandTrapCard(null);
        return;
    }
    if (type === 'trap_cards') {
        setSelectedHandEngine(null);
        setSelectedHandChassis(null);
        setSelectedHandTrapCard(selectedHandTrapCard === card ? null : card); // Toggle selection
        setSelectedAttackerId(null); // Clear attacker selection if selecting a trap card
        setSelectedTargetId(null); // Clear target when switching context
    } else {
        setSelectedHandTrapCard(null);
        switch (type) {
            case 'engines':
                setSelectedHandEngine(selectedHandEngine === card ? null : card); // Toggle selection
                break;
            case 'chassis':
                setSelectedHandChassis(selectedHandChassis === card ? null : card); // Toggle selection
                break;
        }
    }
  }, [setSelectedHandEngine, setSelectedHandChassis, setSelectedHandTrapCard, selectedHandEngine, selectedHandChassis, selectedHandTrapCard]);

  const handlePlayTrapCard = () => {
    if (!myTurn || !selectedHandTrapCard) return;
    let targetForTrapCard = null;
    if (selectedTargetId) {
        targetForTrapCard = selectedTargetId;
    }
    socket.emit('play-trap-card', { 
        trapCardName: selectedHandTrapCard.name, 
        targetId: targetForTrapCard 
    });
    setMyTurn(false);
    setGameMessage(`Playing trap card: ${selectedHandTrapCard.name}...`);
    setSelectedHandTrapCard(null);
    setSelectedAttackerId(null);
    setSelectedTargetId(null);
  };



  const playerDeployedItems = useMemo(() => 
    myFinalLineup.filter(item => item.type === 'truck' || item.type === 'trap_card')
  , [myFinalLineup]);

  return (
    <div className="App">
      {zoomedCard && (
        <div className="card-zoom-overlay" onClick={() => setZoomedCard(null)}>
          <Card card={zoomedCard} type="environments" />
        </div>
      )}


      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      {gameMessage && <p className="game-message">{gameMessage}</p>}

      {destructionMessage && (
        <div className="destruction-message-overlay">
          <p>{destructionMessage}</p>
        </div>
      )}

      {endgameMessage && (
        <div className="endgame-overlay">
          <div className={`endgame-message ${playerWon === false ? 'lose' : ''}`}>
            <p>{endgameMessage}</p>
          </div>
        </div>
      )}

      {gameState && gameState.status === 'battle' && (
        <div className="game-status-bar">
          <p className={blinkingPlayer === 'self' ? 'fuel-blinking' : ''}>Your Fuel: {playerFuel}</p>
          <p className={blinkingPlayer === 'opponent' ? 'fuel-blinking' : ''}>Opponent Fuel: {opponentFuel}</p>
          <p>Round: {gameState.current_round}</p>
          <p>Turn: {myTurn ? 'YOUR TURN' : 'Opponent\'s Turn'}</p>
        </div>
      )}

      {gameClientHand && !isWaiting && (
        <Hand
            hand={gameClientHand}
            playerFuel={playerFuel}
            opponentFuel={opponentFuel}
            myTurn={myTurn} // Pass myTurn prop
            phase={gameState?.status || 'setup'} // Pass phase prop

            onLineupReady={onLineupReady}

            maxDeployableItems={(gameState?.current_round ?? 1) > 1 ? 4 : 3}
            selectedEngine={selectedHandEngine}
            selectedChassis={selectedHandChassis}
            selectedTrapCard={selectedHandTrapCard}
            onCardSelected={handleHandCardSelected}
            playerDeployedItems={playerDeployedItems}
        />
      )}

      {gameState?.status === 'battle' && (
        <div className="battle-layout">
          <div className="lineup-area player">
            <h3>Your Lineup</h3>
            <div className="truck-lineup">
              {myFinalLineup.map((item) => (
                <Card
                  key={item.id}
                  card={item.type === 'truck' ? item.model : item}
                  type={item.type === 'truck' ? 'models' : 'trap_cards'}
                  currentHP={item.type === 'truck' ? item.final_hp : undefined}
                  className={
                    myTurn && !item.has_attacked_this_round && !item.immobilized
                      ? 'card-can-attack' // Glows if it can act (Truck or Trap)
                      : ''
                  }
                  onClick={() => {
                    // Allow selecting Trucks OR Trap Cards as attackers
                    if (myTurn && !item.has_attacked_this_round && !item.immobilized) {
                      setSelectedAttackerId(item.id);
                    } else if (item.type === 'truck') {
                      // Allow inspecting trucks that cannot attack
                      setZoomedCard(item.model); 
                    } else if (item.type === 'trap_card') {
                      // Allow inspecting used/immobilized trap cards
                      setZoomedCard(item.card);
                    }
                  }}
                  isSelected={selectedAttackerId === item.id}
                />
              ))}
            </div>
          </div>

          <div className="middle-battle-area">
            <div className="environment-area">
              <h3>Active Environment</h3>
              {gameState.active_environment && 
                <div onClick={() => setZoomedCard(gameState.active_environment)}>
                  <Card 
                    card={gameState.active_environment} 
                    type="environments" 
                  />
                </div>
              }
            </div>

            {myTurn && selectedHandTrapCard && (
                <div className="trap-card-actions">
                    <p>Select a target for {selectedHandTrapCard.name}</p>
                    <button onClick={handlePlayTrapCard} disabled={!myTurn || !selectedHandTrapCard || (!selectedTargetId && selectedHandTrapCard.name !== "Police")}> 
                        {/* Police might not need a target if it affects 'attacking truck' automatically, 
                            but for active play, we usually target something or just play it. 
                            Let's allow playing if target is selected OR if it doesn't strictly need one 
                            (though for now we enforce target to be safe unless refined).
                        */}
                        Play Card
                    </button>
                    <button onClick={() => handleHandCardSelected(null, 'clear')}>Cancel</button>
                </div>
            )}

            <div className="player-actions">
              {myTurn && canAttack && selectedAttackerId && selectedTargetId && ( <button onClick={handleAttack}>ATTACK!</button> )}
              {myTurn && !canAttack && <button onClick={handlePassTurn}>Pass Turn</button>}
            </div>
          </div>
          
          <div className="lineup-area opponent">
            <h3>Opponent's Lineup</h3>
            <div
              className="truck-lineup"
              onClick={() => {
                  if (myTurn) {
                       const hasOpponentTrucks = opponentFinalLineup.some(i => i.type === 'truck');
                       // Allow selecting fuel as target if NO trucks exist OR if we are using a Trap Card (which might target fuel)
                       if (!hasOpponentTrucks || selectedHandTrapCard) {
                           setSelectedTargetId("opponent_player_fuel");
                       }
                  }
              }}
            >
              {/* Show Fuel Target if no trucks OR if playing a trap card */}
              {(!opponentFinalLineup.some(i => i.type === 'truck') || selectedHandTrapCard) && (
                <div className={`player-fuel-target ${selectedTargetId === "opponent_player_fuel" ? "selected" : ""}`}>
                  <span>Target Opponent's Fuel</span>
                </div>
              )}
              {opponentFinalLineup.map((item) => (
                <Card
                  key={item.id}
                  card={item.revealed ? (item.type === 'truck' ? item.model : item) : {}}
                  type={item.type === 'truck' ? 'models' : 'trap_cards'}
                  currentHP={item.revealed && item.type === 'truck' ? item.final_hp : undefined}
                  isFaceDown={!item.revealed}
                  onClick={() => myTurn && setSelectedTargetId(item.id)}
                  isSelected={selectedTargetId === item.id}
                  // Removed className logic for opponent's cards - they should never glow for the current player
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
