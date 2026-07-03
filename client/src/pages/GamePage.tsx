
import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import BingoCard from '../components/BingoCard';
import { Trophy } from 'lucide-react';
import { useBranding } from '../App';

const API_BASE = window.location.port === '5173'
  ? `http://${window.location.hostname}:3001`
  : `${window.location.protocol}//${window.location.host}`;

const sanitizeRedirectUrl = (url: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};


interface PlayerData {
  playerId: string;
  card: (number | string)[][];
  gameId: string;
}

interface Winner {
  id: string;
  type: string;
}

const GamePage: React.FC = () => {
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [customBranding, setCustomBranding] = useState<any | null>(null);
  
  useEffect(() => {
    const saved = sessionStorage.getItem('bingo_player');
    if (saved) {
      const data = JSON.parse(saved);
      const size = data.card.length;
      const isWrongSize = (size !== 3 && size !== 4) || data.card.some((row: any) => row.length !== size);
      
      if (isWrongSize) {
        sessionStorage.removeItem('bingo_player');
        window.location.href = '/';
        return;
      }
      
      // Verify with the backend if this specific game ID is still active
      const verifyGame = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/game?id=${data.gameId}`);
          if (res.ok) {
            const activeGame = await res.json();
            if (activeGame.id !== data.gameId) {
              console.warn('Game ID mismatch. Clearing player session.');
              sessionStorage.removeItem('bingo_player');
              window.location.href = '/';
            } else {
              setPlayerData(data);
              setGameType(activeGame.game_type || 'MUSIC');
              if (activeGame.status === 'FINISHED') {
                setGameStatus('FINISHED');
                if (activeGame.promo_image) {
                  setFinishedPromoImage(activeGame.promo_image);
                }
              }
            }
          } else {
            setPlayerData(data);
          }
        } catch (err) {
          console.error('Failed to verify game ID:', err);
          setPlayerData(data);
        }
      };
      verifyGame();
    } else {
      window.location.href = '/';
    }
  }, []);

  const [playlist, setPlaylist] = useState<any[]>([]);
  const [calledNumbers, setCalledNumbers] = useState<Set<number>>(new Set());
  const [userMarked, setUserMarked] = useState<Set<number>>(new Set());
  const [lastCalled, setLastCalled] = useState<number | null>(null);
  const [winStatus, setWinStatus] = useState<string | null>(null);
  const [gameStatus, setGameStatus] = useState<string>('WAITING');
  const [finishedPromoImage, setFinishedPromoImage] = useState<string>('');
  const { branding } = useBranding();
  const [gameType, setGameType] = useState<string>('MUSIC');

  // Load custom branding and playlist dynamically for the current game
  useEffect(() => {
    if (playerData?.gameId) {
      const getGameDetails = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/branding?gameId=${playerData.gameId}`);
          if (res.ok) {
            const data = await res.json();
            setCustomBranding(data);
            if (data.primaryColor) document.documentElement.style.setProperty('--primary', data.primaryColor);
            if (data.secondaryColor) document.documentElement.style.setProperty('--secondary', data.secondaryColor);
            if (data.backgroundColor) document.documentElement.style.setProperty('--background', data.backgroundColor);
          }
          const gameRes = await fetch(`${API_BASE}/api/game?id=${playerData.gameId}`);
          if (gameRes.ok) {
            const gameData = await gameRes.json();
            setGameType(gameData.game_type || 'MUSIC');
            if (gameData.playlist) {
              const parsed = JSON.parse(gameData.playlist);
              if (Array.isArray(parsed)) {
                setPlaylist(parsed);
              }
            }
          }
        } catch (err) {
          console.error('Failed to load game details:', err);
        }
      };
      getGameDetails();
    }
  }, [playerData]);

  const handleCellClick = (num: number) => {
    setUserMarked(prev => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else {
        next.add(num);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!playerData) return;

    socket.connect();
    socket.emit('JOIN_ROOM', { gameId: playerData.gameId });

    socket.on('NUMBER_CALLED', (data: { number: number, allNumbers: number[] }) => {
      setCalledNumbers(new Set(data.allNumbers));
      setLastCalled(data.number);
    });

    socket.on('WINNERS_UPDATE', (data: { winners: Winner[] }) => {
      if (playerData) {
        const myWin = data.winners.find(w => w.id === playerData.playerId);
        if (myWin) {
          setWinStatus(myWin.type);
        }
      }
    });

    socket.on('GAME_STARTED', () => setGameStatus('STARTED'));
    socket.on('FINALE_STARTED', () => setGameStatus('FINALE'));
    
    socket.on('GAME_FINISHED', (data?: { redirectUrl?: string; redirectDelay?: number; autoRedirectEnabled?: number; promoImage?: string; promoImageDelay?: number }) => {
      setGameStatus('FINISHED');
      if (data && data.promoImage) {
        const delayMs = (data.promoImageDelay ?? 0) * 1000;
        setTimeout(() => {
          setFinishedPromoImage(data.promoImage || '');
        }, delayMs);
      }
      if (data && data.redirectUrl && data.autoRedirectEnabled !== 0) {
        const url = sanitizeRedirectUrl(data.redirectUrl);
        const delayMs = (data.redirectDelay ?? 30) * 1000;
        console.log(`Game finished. Auto-redirecting to: ${url} in ${delayMs / 1000}s`);
        setTimeout(() => {
          window.location.href = url;
        }, delayMs);
      } else {
        console.log('Game finished. Auto-redirect is disabled or redirect URL is missing.');
      }
    });
    
    socket.on('GAME_RESET', () => {
      console.log('Game has been reset by admin. Redirecting...');
      sessionStorage.removeItem('bingo_player');
      window.location.href = '/';
    });

    socket.on('FORCE_REDIRECT', (data: { redirectUrl: string }) => {
      if (data && data.redirectUrl) {
        const url = sanitizeRedirectUrl(data.redirectUrl);
        console.log('Forced redirect received. Navigating to:', data.redirectUrl);
        window.location.href = url;
      }
    });

    return () => {
      socket.off('NUMBER_CALLED');
      socket.off('WINNERS_UPDATE');
      socket.off('GAME_STARTED');
      socket.off('FINALE_STARTED');
      socket.off('GAME_FINISHED');
      socket.off('GAME_RESET');
      socket.off('FORCE_REDIRECT');
      socket.disconnect();
    };
  }, [playerData]);

  useEffect(() => {
    if (winStatus) {
      const triggerConfetti = () => {
        // @ts-ignore
        if (window.confetti) {
          // @ts-ignore
          window.confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
          });
        }
      };

      // @ts-ignore
      if (window.confetti) {
        triggerConfetti();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
        script.async = true;
        script.onload = triggerConfetti;
        document.body.appendChild(script);
      }
    }
  }, [winStatus]);

  if (!playerData) return <div>Loading...</div>;

  const activeBranding = customBranding || branding;

  return (
    <div>
      {gameStatus === 'FINISHED' && finishedPromoImage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(13, 5, 38, 0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(8px)',
          padding: '1.5rem'
        }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', padding: '2rem', border: '2px solid var(--accent)', margin: 0 }}>
            <Trophy size={48} style={{ color: 'var(--warning)', marginBottom: '1rem', filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.4))' }} />
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 900 }}>Thanks for Playing!</h2>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '1.5rem' }}>
              <img 
                src={finishedPromoImage} 
                alt="Thank you flyer" 
                style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '0.75rem' }} 
              />
            </div>
            <button 
              onClick={() => setFinishedPromoImage('')}
              style={{
                width: '100%',
                background: 'var(--secondary)',
                fontSize: '1rem',
                padding: '0.75rem',
                boxShadow: 'none'
              }}
            >
              View My Bingo Card
            </button>
          </div>
        </div>
      )}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {activeBranding?.logoUrl && (
              <img src={activeBranding.logoUrl} alt="Logo" style={{ height: '24px', maxWidth: '80px', objectFit: 'contain' }} />
            )}
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{activeBranding?.companyName || 'Your Card'}</h2>
          </div>
          <span style={{ fontSize: '0.875rem', color: 'var(--secondary)' }}>ID: {playerData.playerId.slice(0, 8)}</span>
        </div>
        
        {winStatus && (
          <div className="win-banner">
            <Trophy size={24} />
            <strong>YOU WON: {winStatus.replace('_', ' ')}!</strong>
          </div>
        )}

        <div className="called-number-display-wrapper" style={{ height: 'auto', minHeight: '120px' }}>
          {(() => {
            const currentItem = lastCalled && playlist[lastCalled - 1];
            const displayTitle = gameType === 'NUMERIC'
              ? (lastCalled ? `Number ${lastCalled}` : null)
              : (currentItem 
                  ? (typeof currentItem === 'object' ? currentItem.name : currentItem)
                  : null);
            const label = gameType === 'NUMERIC' ? 'Called Number' : 'Now Playing';
            const isActive = lastCalled !== null;
            return (
              <div className={`bingo-ball ${isActive ? 'active' : 'idle'}`} style={{ 
                borderRadius: '1.5rem', 
                width: 'auto', 
                minWidth: '240px', 
                padding: '1rem 2rem',
                height: 'auto',
                aspectRatio: 'auto'
              }}>
                <span className="ball-inner" style={{ 
                  borderRadius: '1.25rem', 
                  width: '100%', 
                  height: '100%',
                  padding: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0.25rem'
                }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '2px', fontWeight: 800 }}>{label}</span>
                  <span className="ball-number" style={{ 
                    fontSize: '1.2rem', 
                    whiteSpace: 'normal', 
                    wordBreak: 'break-word',
                    lineHeight: '1.4'
                  }}>
                    {displayTitle || 'Waiting...'}
                  </span>
                </span>
              </div>
            );
          })()}
        </div>
        
        <p style={{ textAlign: 'center', color: 'var(--secondary)', marginBottom: '1.5rem' }}>
          {gameStatus === 'WAITING' ? 'Waiting for host to start...' : 
           gameStatus === 'FINISHED' ? 'Game Over' : 'Game in progress...'}
        </p>

        <BingoCard 
          card={playerData.card} 
          markedNumbers={calledNumbers} 
          userMarked={userMarked}
          onCellClick={handleCellClick}
          playlist={playlist}
        />
      </div>

      <div className="card">
        <h3>{gameType === 'NUMERIC' ? 'Number History' : 'Song History'} ({calledNumbers.size} called)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {Array.from(calledNumbers).reverse().map((num, idx) => {
            const songName = gameType === 'NUMERIC'
              ? `Number ${num}`
              : (playlist[num - 1] 
                  ? (typeof playlist[num - 1] === 'object' && playlist[num - 1] !== null ? (playlist[num - 1] as any).name : playlist[num - 1])
                  : `Song #${num}`);
            const isLast = num === lastCalled;
            return (
              <div 
                key={num} 
                className="winner-item"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  background: isLast ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(255, 255, 255, 0.02)',
                  border: isLast ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.05)',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>#{calledNumbers.size - idx}</span>
                  <span style={{ fontWeight: isLast ? 800 : 500, color: isLast ? 'var(--accent)' : 'var(--text)' }}>
                    {songName}
                  </span>
                </div>
                {isLast && <span style={{ fontSize: '0.7rem', background: 'var(--accent)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontWeight: 800 }}>LAST</span>}
              </div>
            );
          })}
          {calledNumbers.size === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '1rem 0' }}>No songs played yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePage;
