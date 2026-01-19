import React, { useState } from 'react'; // Import useState
import './Card.css';

interface CardProps {
  card: any; // Generic card object from gameData
  type: 'models' | 'engines' | 'chassis' | 'environments' | 'trap_cards';
  onClick?: (card: any, type: string) => void;
  isSelected?: boolean;
  currentHP?: number;
  isFaceDown?: boolean; // New prop for fog of war
  className?: string; // Allow passing custom classes
  chassisName?: string; // For deployed trucks
  myTurn?: boolean; // Add myTurn prop
}

const Card: React.FC<CardProps> = ({ card, type, onClick, isSelected, currentHP, isFaceDown, className, chassisName, myTurn }) => {
  const [imageError, setImageError] = useState(false); // State to track image loading error

  // Inside the Card component, before the return statement:
  console.log(`[Card ${card.name}] type: ${type}, myTurn: ${myTurn}, has_attacked: ${card.has_attacked_this_round}, immobilized: ${card.immobilized}, className: ${className}`);

  if (!card) return null;


  // Render face-down card if specified
  if (isFaceDown) {
    return (
      <div className={`card ${isSelected ? 'selected' : ''} ${className || ''}`} onClick={() => onClick && onClick(card, type)}>
        <img src="/assets/cards/Card_Back.png" alt="Card Back" className="card-image" onError={() => setImageError(true)} />
        {imageError && ( // Show placeholder if Card_Back.png also fails
            <div className="card-image-placeholder face-down">
                <span>(Card Back Missing)</span>
            </div>
        )}
      </div>
    );
  }

  const getImagePath = (cardData: any, cardType: string) => {
    if (cardType === 'engines' && cardData.imageClass) {
      const initial = cardData.imageClass.charAt(0).toUpperCase(); // H, M, or L
      return `/assets/cards/Engine_${initial}.png`;
    }

    // Standardize name for filename for all other card types
    const cardName = cardData.name || cardData.model_name;
    const fileName = cardName.replace(/ /g, '_').replace(/\//g, '-');
    let folder = '';

    switch (cardType) {
      case 'models': folder = 'Truck_'; break;
      // engines case is handled above
      case 'chassis': folder = 'Chassis_'; break;
      case 'environments': folder = 'Environment_'; break;
      case 'trap_cards': folder = 'Trap_'; break;
      default: folder = '';
    }

    return `/assets/cards/${folder}${fileName}.png`;
  };

  // Helper function to get compatibility text for engines and chassis
  const getCompatibilityText = (cardType: string, cardData: any): string => {
    if (cardType === 'engines') {
      switch (cardData.class) {
        case 'Light': return 'Light, Medium';
        case 'Medium': return 'Light, Medium, Heavy';
        case 'Heavy': return 'Medium, Heavy';
        default: return '';
      }
    } else if (cardType === 'chassis') {
      let compatibleTrucks: string[] = [];
      if (cardData.classes.includes('Light')) {
        compatibleTrucks.push('Light', 'Medium');
      }
      if (cardData.classes.includes('Medium')) {
        compatibleTrucks.push('Light', 'Medium', 'Heavy');
      }
      if (cardData.classes.includes('Heavy')) {
        compatibleTrucks.push('Medium', 'Heavy');
      }

      const uniqueCompatibleTrucks = [...new Set(compatibleTrucks)].sort((a,b) => {
        const order = ['Light', 'Medium', 'Heavy'];
        return order.indexOf(a) - order.indexOf(b);
      });

      if (uniqueCompatibleTrucks.length > 0) {
          return `${uniqueCompatibleTrucks.join(', ')}`;
      }
      return '';
    }
    return '';
  };

  const imagePath = getImagePath(card, type);

  // Determine border color based on type and class
  const getBorderClass = () => {
    switch (type) {
      case 'models':
        if (card.compatible_engine_classes?.includes('Light') && card.compatible_engine_classes.length === 1) return 'card-border-light';
        if (card.compatible_engine_classes?.includes('Medium') && card.compatible_engine_classes.length === 1) return 'card-border-medium';
        if (card.compatible_engine_classes?.includes('Heavy') && card.compatible_engine_classes.length === 1) return 'card-border-heavy';
        return 'card-border-default';
      case 'engines':
        if (card.class === 'Light') return 'card-border-light';
        if (card.class === 'Medium') return 'card-border-medium';
        if (card.class === 'Heavy') return 'card-border-heavy';
        return 'card-border-default';
      case 'chassis':
        if (card.classes.includes('Light') && card.classes.length === 1) return 'card-border-light';
        if (card.classes.includes('Medium') && card.classes.length === 1) return 'card-border-medium';
        if (card.classes.includes('Heavy') && card.classes.length === 1) return 'card-border-heavy';
        if (card.classes.includes('Light') && card.classes.includes('Medium')) return 'card-border-light-medium';
        if (card.classes.includes('Medium') && card.classes.includes('Heavy')) return 'card-border-medium-heavy';
        return 'card-border-default';
      case 'environments': return 'card-border-environment';
      case 'trap_cards': return 'card-border-trap'; // New case for trap cards
      default: return 'card-border-default';
    }
  };

  const borderClass = getBorderClass();

  return (
    <div className={`card ${borderClass} ${isSelected ? 'selected' : ''} ${className || ''}`} onClick={() => onClick && onClick(card, type)}>
      {imageError ? (
        <div className="card-image-placeholder">
          <span>{card.name || card.model_name}</span>
          <span>(Image Missing)</span>
        </div>
      ) : (
        <img
          src={imagePath}
          alt={card.name || card.model_name}
          className="card-image"
          onError={() => setImageError(true)} // Set error state if image fails to load
        />
      )}
      <div className="card-info">
        <p className="card-name">{card.name || card.model_name}</p>
        {type === 'models' && currentHP === undefined && (
            <p className="card-model-bonus">
                {card.name === 'Light' ? '+0 HP' : card.name === 'Medium' ? '+15 HP' : '+35 HP'}
            </p>
        )}
        {type === 'engines' && <p className="card-compatibility-info">{getCompatibilityText(type, card)}</p>}
        {type === 'engines' && card.fuel_modifier !== undefined && (
          <p className="card-fuel-modifier">Fuel: {card.fuel_modifier}</p>
        )}
        {type === 'models' && currentHP !== undefined && (
          <p className="card-hp">{currentHP} HP</p>
        )}
        {type === 'models' && chassisName && (
          <p className="card-chassis-name">Chassis: {chassisName}</p>
        )}
        {type === 'chassis' && <p className="card-compatibility-info">{getCompatibilityText(type, card)}</p>}
        {type === 'chassis' && card.fuel_capacity !== undefined && (
          <p className="card-fuel-capacity">Fuel: +{card.fuel_capacity}</p>
        )}
        {type === 'environments' && <p className="card-rule-description">{card.rule_description}</p>}
        {type === 'trap_cards' && <p className="card-rule-description">{card.description}</p>} {/* New display for trap cards */}
      </div>
    </div>
  );
};

export default Card;