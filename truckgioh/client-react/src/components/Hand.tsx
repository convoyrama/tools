import React, { useState, useEffect } from 'react';
import Card from './Card';
import { socket } from '../services/socket';
import type { DeployableItem } from '../App';
import './Hand.css';

// --- Interfaces ---
interface TruckCardData { name: string; compatible_engine_classes: string[]; compatible_chassis_classes: string[]; }
interface EngineCardData { name: string; hp: number; class: string; fuel_modifier?: number; }
interface ChassisCardData { name: string; classes: string[]; fuel_capacity?: number; }
interface TrapCardData { name: string; description: string; effects: any[]; }

interface PlayerHand { models: TruckCardData[]; engines: EngineCardData[]; chassis: ChassisCardData[]; trap_cards: TrapCardData[]; }



interface HandProps {
  hand: PlayerHand;
  onLineupReady: (lineup: DeployableItem[]) => void;
  playerFuel: number;
  opponentFuel: number;
  myTurn: boolean; // Add myTurn prop
  phase: string; // New prop for game phase

  maxDeployableItems: number; // Renamed from maxTrucks
  // Props for selected states and selection callback
  selectedEngine: EngineCardData | null;
  selectedChassis: ChassisCardData | null;
  selectedTrapCard: TrapCardData | null;
  onCardSelected: (card: any | null, type: string) => void;
  playerDeployedItems: DeployableItem[]; // New prop to receive currently deployed items from App.tsx
}

const Hand: React.FC<HandProps> = ({ hand, onLineupReady, maxDeployableItems, playerFuel, opponentFuel, myTurn, phase, selectedEngine, selectedChassis, selectedTrapCard, onCardSelected, playerDeployedItems }) => {
  const [stagedDeployedItems, setStagedDeployedItems] = useState<DeployableItem[]>(playerDeployedItems);
  const [message, setMessage] = useState<string>(`Build up to ${maxDeployableItems} items.`);
  const [combinationMessage, setCombinationMessage] = useState<string>(''); // New state for combination-specific messages

  // Sync stagedDeployedItems with prop from App.tsx (for replenishment)
  useEffect(() => {
    setStagedDeployedItems(playerDeployedItems);
  }, [playerDeployedItems]);

  const handleCardSelection = (card: any, type: string) => {
    onCardSelected(card, type);
    setMessage(''); // Clear any previous messages
    setCombinationMessage(''); // Clear combination message on new selection
  };

  const handleDeployItem = () => {
    setCombinationMessage(''); // Clear previous message on new attempt
    console.log('DEBUG: handleDeployItem called.');
    if (stagedDeployedItems.length >= maxDeployableItems) {
      setMessage(`Maximum ${maxDeployableItems} items already deployed.`);
      return;
    }

    // Logic for Deploying Trap Cards (Setup Phase)
    if (selectedTrapCard) {
        const tempId = `temp_trap_${Date.now()}`;
        setStagedDeployedItems(prev => [...prev, { type: 'trap_card', card: selectedTrapCard, id: tempId }]);
        onCardSelected(null, 'clear');
        setMessage('Trap card deployed!');
        return;
    }

    if (selectedEngine && selectedChassis) {
      if (stagedDeployedItems.filter(item => item.type === 'truck').length >= 3) {
        setMessage('Maximum of 3 trucks already deployed.');
        return;
      }
      
      // Create a virtual model based on the Engine Class
      const virtualModel = { name: selectedEngine.class, compatible_engine_classes: [], compatible_chassis_classes: [] };
      
      const combination = { model: virtualModel, engine: selectedEngine, chassis: selectedChassis };
      console.log('DEBUG: Emitting validate-combination with:', combination);
      
      // IMPORTANT: Server now expects { engine, chassis } primarily, but we follow old structure just in case
      // Actually, let's send just what the server now validates: { engine, chassis }
      // But we keep 'model' in the local state for rendering the card image
      socket.emit('validate-combination', { engine: selectedEngine, chassis: selectedChassis }, (result: { valid: boolean; message: string }) => {
        console.log('DEBUG: Received validation callback with result:', result);
        if (result.valid) {
          console.log('DEBUG: Validation successful, updating state.');
          const tempId = `temp_truck_${Date.now()}`;
          setStagedDeployedItems(prev => [...prev, { type: 'truck', ...combination, id: tempId }]);
          onCardSelected(null, 'clear'); // Clear selection in parent
          setMessage('Truck deployed!');
        } else {
          setCombinationMessage(result.message); // Set combination-specific message
        }
      });
    } else {
      setCombinationMessage('Selection incomplete. Select an Engine and a Chassis.');
    }
  };

  const handleRemoveDeployedItem = (idToRemove: string) => {
    const itemToRemove = stagedDeployedItems.find(item => item.id === idToRemove);
    if (!itemToRemove) return;
    setStagedDeployedItems(prev => prev.filter(item => item.id !== idToRemove));
    setMessage('Item removed from deployment area.');
  };

  const handleSendLineup = () => {
    if (stagedDeployedItems.length === 0) {
      setMessage('You must deploy at least one item.');
      return;
    }
    onLineupReady(stagedDeployedItems);
    setMessage('Convoy submitted! Waiting for opponent...');
  };
  
  const availableHand = {
      engines: hand.engines.filter(c => !stagedDeployedItems.some(i => i.type === 'truck' && i.engine === c)),
      chassis: hand.chassis.filter(c => !stagedDeployedItems.some(i => i.type === 'truck' && i.chassis === c)),
  };

  if (!hand) {
      return <div className="hand-container"><p>Waiting for hand...</p></div>
  }
  
  const isDeployDisabled = !(selectedEngine && selectedChassis) || stagedDeployedItems.length >= maxDeployableItems;

  return (
    <div className="hand-container">
      <div className="hand-fuel-display">
        <h3>Current Fuel</h3>
        <p>Your Fuel: {playerFuel}</p>
        <p>Opponent Fuel: {opponentFuel}</p>
      </div>
      {message && <p className="message">{message}</p>}
      
      {phase !== 'battle' && (
        <>
          <button onClick={handleSendLineup} disabled={stagedDeployedItems.length === 0} className="send-lineup-btn">
            Send Convoy & Start Battle
          </button>

          <div className="deployed-items-area">
              <h3>Deployed Items ({stagedDeployedItems.length}/{maxDeployableItems})</h3>
              <div className="card-row">
                  {stagedDeployedItems.map((item) => (
                      <div key={item.id} className="deployed-item-wrapper" onClick={() => handleRemoveDeployedItem(item.id)}>
                        {item.type === 'truck' ? (
                            <Card card={item.model} type="models" currentHP={item.engine.hp} chassisName={item.chassis.name} myTurn={myTurn} />
                        ) : (
                            <Card card={item.card} type="trap_cards" myTurn={myTurn} />
                        )}
                        <button className="remove-deployed-item">X</button>
                      </div>
                  ))}
              </div>
          </div>
          
          <hr/>

          <div className="combination-area">
            <h3>Current Selection</h3>
            <div className="selected-cards-display">
              {/* Truck Assembly Preview */}
              {!selectedTrapCard && (
                <>
                  {selectedEngine ? (
                     <Card card={{ name: selectedEngine.class }} type="models" /> 
                  ) : <div className="card-placeholder">Truck Preview</div>}
                  
                  {selectedEngine ? <Card card={selectedEngine} type="engines" /> : <div className="card-placeholder">Engine</div>}
                  {selectedChassis ? <Card card={selectedChassis} type="chassis" /> : <div className="card-placeholder">Chassis</div>}
                </>
              )}

              {/* Trap Card Preview */}
              {selectedTrapCard && (
                 <div className="trap-card-preview">
                    <Card card={selectedTrapCard} type="trap_cards" />
                    <p>Select this card to deploy it to the battlefield.</p>
                 </div>
              )}
            </div>
            
            {!selectedTrapCard && selectedEngine && selectedChassis && (
              <div className="assembled-truck-stats">
                <p>HP: {selectedEngine.hp}</p>
                <p>Fuel: {(selectedChassis.fuel_capacity || 0) + (selectedEngine.fuel_modifier || 0)}</p>
              </div>
            )}

            <button onClick={() => onCardSelected(null, 'clear')} disabled={!(selectedEngine || selectedChassis || selectedTrapCard)}>
              Clear All Selections
            </button>
            {combinationMessage && <p className="combination-message error">{combinationMessage}</p>}
            
            <button onClick={handleDeployItem} disabled={isDeployDisabled}>
              {selectedTrapCard ? 'Deploy Trap Card' : 'Deploy Truck'}
            </button>
          </div>
          
          <hr/>
        </>
      )}
      
      {/* Only show this section if we are NOT in battle OR if we are in battle and have traps */}
      {(phase !== 'battle' || (hand.trap_cards && hand.trap_cards.length > 0)) && (
          <div className="card-selection-area">
            <h3>Your Hand {phase === 'battle' ? '(Select Trap Cards to Play)' : ''}</h3>
            
            {/* Setup Phase: Show Engines and Chassis */}
            {phase !== 'battle' && (
                <>
                    <h4>Engines</h4>
                    <div className="card-row">
                      {availableHand.engines.map((card, index) => ( <Card key={`engine-${index}`} card={card} type="engines" onClick={() => handleCardSelection(card, 'engines')} isSelected={selectedEngine === card} /> ))}
                    </div>
                    <h4>Chassis</h4>
                    <div className="card-row">
                      {availableHand.chassis.map((card, index) => ( <Card key={`chassis-${index}`} card={card} type="chassis" onClick={() => handleCardSelection(card, 'chassis')} isSelected={selectedChassis === card} /> ))}
                    </div>
                </>
            )}

            {/* Always show Trap Cards if present */}
            {hand.trap_cards && hand.trap_cards.length > 0 && (
                <>
                    <h4>Trap Cards</h4>
                    <div className="card-row">
                      {hand.trap_cards.map((card, index) => ( <Card key={`trap-${index}`} card={card} type="trap_cards" onClick={() => handleCardSelection(card, 'trap_cards')} isSelected={selectedTrapCard === card} /> ))}
                    </div>
                </>
            )}
          </div>
      )}
    </div>
  );
};

export default Hand;
