import React, { useState, useEffect } from 'react';
import Card from './Card';
import { socket } from '../services/socket';
import type { DeployableItem } from '../App';
import './Hand.css';

// --- Interfaces ---
interface TruckCardData { name: string; compatible_engine_classes: string[]; compatible_chassis_classes: string[]; }
interface EngineCardData { name: string; hp: number; class: string; }
interface ChassisCardData { name: string; classes: string[]; }
interface TrapCardData { name: string; description: string; effects: any[]; }

interface PlayerHand { models: TruckCardData[]; engines: EngineCardData[]; chassis: ChassisCardData[]; trap_cards: TrapCardData[]; }



interface HandProps {
  hand: PlayerHand;
  onLineupReady: (lineup: DeployableItem[]) => void;

  maxDeployableItems: number; // Renamed from maxTrucks
  // Props for selected states and selection callback
  selectedModel: TruckCardData | null;
  selectedEngine: EngineCardData | null;
  selectedChassis: ChassisCardData | null;
  selectedTrapCard: TrapCardData | null;
  onCardSelected: (card: any | null, type: string) => void;
  playerDeployedItems: DeployableItem[]; // New prop to receive currently deployed items from App.tsx
}

const Hand: React.FC<HandProps> = ({ hand, onLineupReady, maxDeployableItems, selectedModel, selectedEngine, selectedChassis, selectedTrapCard, onCardSelected, playerDeployedItems }) => {
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

    if (selectedModel && selectedEngine && selectedChassis) {
      if (stagedDeployedItems.filter(item => item.type === 'truck').length >= 3) {
        setMessage('Maximum of 3 trucks already deployed.');
        return;
      }
      const combination = { model: selectedModel, engine: selectedEngine, chassis: selectedChassis };
      console.log('DEBUG: Emitting validate-combination with:', combination);
      socket.emit('validate-combination', combination, (result: { valid: boolean; message: string }) => {
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
      setCombinationMessage('Selection incomplete. Select a valid truck combination.');
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
      models: hand.models.filter(c => !stagedDeployedItems.some(i => i.type === 'truck' && i.model === c)),
      engines: hand.engines.filter(c => !stagedDeployedItems.some(i => i.type === 'truck' && i.engine === c)),
      chassis: hand.chassis.filter(c => !stagedDeployedItems.some(i => i.type === 'truck' && i.chassis === c)),
  };

  if (!hand) {
      return <div className="hand-container"><p>Waiting for hand...</p></div>
  }
  
  const isDeployDisabled = !(selectedModel && selectedEngine && selectedChassis) || stagedDeployedItems.length >= maxDeployableItems;

  return (
    <div className="hand-container">
      {message && <p className="message">{message}</p>}
      
      <button onClick={handleSendLineup} disabled={stagedDeployedItems.length === 0} className="send-lineup-btn">
        Send Convoy & Start Battle
      </button>

      <div className="deployed-items-area">
          <h3>Deployed Items ({stagedDeployedItems.length}/{maxDeployableItems})</h3>
          <div className="card-row">
              {stagedDeployedItems.map((item) => (
                  <div key={item.id} className="deployed-item-wrapper" onClick={() => handleRemoveDeployedItem(item.id)}>
                    {item.type === 'truck' ? (
                        <Card card={item.model} type="models" currentHP={item.engine.hp} />
                    ) : (
                        <Card card={item.card} type="trap_cards" />
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
          {selectedModel ? <Card card={selectedModel} type="models" /> : <div className="card-placeholder">Truck</div>}
          {selectedEngine ? <Card card={selectedEngine} type="engines" /> : <div className="card-placeholder">Engine</div>}
          {selectedChassis ? <Card card={selectedChassis} type="chassis" /> : <div className="card-placeholder">Chassis</div>}
        </div>
        <button onClick={() => onCardSelected(null, 'clear')} disabled={!(selectedModel || selectedEngine || selectedChassis || selectedTrapCard)}>
          Clear All Selections
        </button>
        {combinationMessage && <p className="combination-message error">{combinationMessage}</p>}
        <button onClick={handleDeployItem} disabled={isDeployDisabled}>
          Deploy Truck
        </button>
      </div>
      
      <hr/>
      
      <div className="card-selection-area">
        <h3>Your Hand</h3>
        <h4>Truck Models</h4>
        <div className="card-row">
          {availableHand.models.map((card, index) => ( <Card key={`model-${index}`} card={card} type="models" onClick={() => handleCardSelection(card, 'models')} isSelected={selectedModel === card} /> ))}
        </div>
        <h4>Engines</h4>
        <div className="card-row">
          {availableHand.engines.map((card, index) => ( <Card key={`engine-${index}`} card={card} type="engines" onClick={() => handleCardSelection(card, 'engines')} isSelected={selectedEngine === card} /> ))}
        </div>
        <h4>Chassis</h4>
        <div className="card-row">
          {availableHand.chassis.map((card, index) => ( <Card key={`chassis-${index}`} card={card} type="chassis" onClick={() => handleCardSelection(card, 'chassis')} isSelected={selectedChassis === card} /> ))}
        </div>
      </div>
    </div>
  );
};

export default Hand;
