import React from 'react';

interface BingoCardProps {
  card: (number | string)[][];
  markedNumbers: Set<number>;
  userMarked: Set<number>;
  onCellClick: (num: number) => void;
  playlist?: (string | { name: string; uri: string })[];
}

const BingoCard: React.FC<BingoCardProps> = ({ card, markedNumbers, userMarked, onCellClick, playlist }) => {
  // Take only the 3x3 grid
  const displayCard = card.slice(0, 3).map(row => row.slice(0, 3));

  return (
    <div className="bingo-grid">
      {displayCard.map((row, r) => (
        row.map((cell, c) => {
          const isServerMarked = typeof cell === 'number' && markedNumbers.has(cell);
          const isUserMarked = typeof cell === 'number' && userMarked.has(cell);
          
          const item = typeof cell === 'number' && playlist ? playlist[cell - 1] : null;
          const songTitle = item 
            ? (typeof item === 'object' && item !== null ? (item as any).name : item) 
            : cell;

          return (
            <div
              key={`${r}-${c}`}
              className={`bingo-cell ${isUserMarked ? 'daubed' : ''} ${isServerMarked ? 'called' : ''}`}
              onClick={() => typeof cell === 'number' && onCellClick(cell)}
              style={{
                fontSize: '0.85rem',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                minHeight: '80px',
                wordBreak: 'break-word',
                fontWeight: 700
              }}
            >
              {songTitle}
            </div>
          );
        })
      ))}
    </div>
  );
};

export default BingoCard;
