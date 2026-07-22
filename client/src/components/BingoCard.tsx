import React from 'react';

interface BingoCardProps {
  card: (number | string)[][];
  markedNumbers: Set<number>;
  userMarked: Set<number>;
  onCellClick: (num: number) => void;
  playlist?: (string | { name: string; uri: string })[];
}

const BingoCard: React.FC<BingoCardProps> = ({ card, markedNumbers, userMarked, onCellClick, playlist }) => {
  // Support dynamic card sizes (3x3, 4x4, etc.)
  const displayCard = card;

  return (
    <div 
      className="bingo-grid"
      style={{
        gridTemplateColumns: `repeat(${displayCard.length}, 1fr)`,
        gap: displayCard.length === 4 ? '10px' : '16px'
      }}
    >
      {displayCard.map((row, r) => (
        row.map((cell, c) => {
          const isServerMarked = typeof cell === 'number' && markedNumbers.has(cell);
          const isUserMarked = typeof cell === 'number' && userMarked.has(cell);
          
          const item = typeof cell === 'number' && playlist && playlist.length > 0 ? playlist[cell - 1] : null;
          const songTitle = item 
            ? (typeof item === 'object' && item !== null ? (`${(item as any).name || (item as any).title || ''}${(item as any).artist ? ' - ' + (item as any).artist : ''}`) : item) 
            : cell;

          const is4x4 = displayCard.length === 4;
          const isNumeric = typeof cell === 'number' && (!playlist || playlist.length === 0 || typeof songTitle === 'number');

          return (
            <div
              key={`${r}-${c}`}
              className={`bingo-cell ${isUserMarked ? 'daubed' : ''} ${isServerMarked ? 'called' : ''}`}
              onClick={() => typeof cell === 'number' && onCellClick(cell)}
              style={{
                fontSize: isNumeric
                  ? (is4x4 ? '1.3rem' : '1.6rem') 
                  : (String(songTitle).length > 30 
                      ? (is4x4 ? '0.55rem' : '0.65rem') 
                      : (String(songTitle).length > 18 ? (is4x4 ? '0.625rem' : '0.725rem') : (is4x4 ? '0.7rem' : '0.8rem'))),
                padding: is4x4 ? '0.25rem' : '0.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                minHeight: is4x4 ? '68px' : '84px',
                wordBreak: 'break-word',
                fontWeight: 700,
                lineHeight: '1.2',
                overflow: 'hidden'
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
