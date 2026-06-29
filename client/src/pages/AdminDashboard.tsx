
import React, { useEffect, useState, useCallback } from 'react';
import { socket } from '../socket';
import FireworksCanvas from '../components/FireworksCanvas';
import { Trophy } from 'lucide-react';
import { useBranding } from '../App';
import QRCode from 'qrcode';


const API_BASE = window.location.port === '5173'
  ? `http://${window.location.hostname}:3001`
  : `${window.location.protocol}//${window.location.host}`;

interface Game {
  id: string;
  status: 'WAITING' | 'STARTED' | 'FINALE' | 'FINISHED';
  finale_numbers: string;
  lineWinOccurred?: boolean;
  twoLinesWinOccurred?: boolean;
  cornersWinOccurred?: boolean;
  calledNumbers?: number[];
  redirect_url?: string;
  redirect_delay?: number;
  auto_redirect_enabled?: number;
  room_code?: string;
}

interface Winner {
  id: string;
  name?: string;
  type: string;
}

const AdminDashboard: React.FC = () => {
  const [game, setGame] = useState<Game | null>(null);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [hostIp, setHostIp] = useState<string>('localhost');
  const [isPresenterMode, setIsPresenterMode] = useState<boolean>(false);
  const [redirectUrlInput, setRedirectUrlInput] = useState<string>('');
  const [redirectDelay, setRedirectDelay] = useState<number>(30);
  const [autoRedirectEnabled, setAutoRedirectEnabled] = useState<boolean>(true);
  const [presenterWinOverlay, setPresenterWinOverlay] = useState<{ type: string; winners: { id: string; name?: string }[]; winningNumber: number | null } | null>(null);
  const [isCallingPaused, setIsCallingPaused] = useState<boolean>(false);
  const [showFireworks, setShowFireworks] = useState<boolean>(false);
  const [connectedCount, setConnectedCount] = useState<number>(0);
  const [joinedCount, setJoinedCount] = useState<number>(0);

  const { branding, refreshBranding } = useBranding();

  const [clickCount, setClickCount] = useState(0);
  const [showSecretBranding, setShowSecretBranding] = useState(false);

  const [brandName, setBrandName] = useState('');
  const [brandLogo, setBrandLogo] = useState('');
  const [brandPrimary, setBrandPrimary] = useState('#ec4899');
  const [brandSecondary, setBrandSecondary] = useState('#6366f1');
  const [brandBackground, setBrandBackground] = useState('#0d0526');
  const [brandPromoImage, setBrandPromoImage] = useState<string>('');
  const [promoImageDelay, setPromoImageDelay] = useState<number>(0);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [playlist, setPlaylist] = useState<string[]>([]);
  const [playlistInput, setPlaylistInput] = useState<string>('');
  const [audioFiles, setAudioFiles] = useState<{ id: number; name: string; file: File }[]>([]);
  const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [spotifySyncEnabled, setSpotifySyncEnabled] = useState<boolean>(false);
  const [spotifyClientId, setSpotifyClientId] = useState<string>('');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState<string>('');
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState<string>('');
  const [spotifyConnected, setSpotifyConnected] = useState<boolean>(false);

  // Sync promo image, delay, and playlist from game data
  useEffect(() => {
    if (game) {
      setBrandPromoImage((game as any).promo_image || '');
      if ('promo_image_delay' in game && game.promo_image_delay !== undefined && game.promo_image_delay !== null) {
        setPromoImageDelay((game as any).promo_image_delay);
      }
      if ('playlist' in game && (game as any).playlist) {
        try {
          const parsed = JSON.parse((game as any).playlist);
          setPlaylist(parsed);
          setPlaylistInput(parsed.map((item: any) => typeof item === 'object' && item !== null ? item.name : item).join('\n'));
        } catch (e) {
          console.error('Failed to parse playlist:', e);
        }
      }
      setSpotifyClientId((game as any).spotify_client_id || '');
      setSpotifyClientSecret((game as any).spotify_client_secret || '');
      setSpotifyPlaylistUrl((game as any).spotify_playlist_url || '');
      setSpotifyConnected(!!(game as any).spotify_access_token);
    }
  }, [game]);

  // Generate local QR code offline
  useEffect(() => {
    if (game?.room_code) {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const joinUrl = isLocalHost
        ? `${window.location.protocol}//${hostIp}${window.location.port ? `:${window.location.port}` : ''}/?room=${game.room_code}`
        : `${window.location.protocol}//${window.location.host}/?room=${game.room_code}`;
      
      QRCode.toDataURL(joinUrl, { width: 300, margin: 2 })
        .then(url => setQrCodeUrl(url))
        .catch(err => console.error('Failed to generate local QR code:', err));
    }
  }, [game?.room_code, hostIp]);

  // Reset title clicks after 3 seconds of inactivity
  useEffect(() => {
    if (clickCount > 0) {
      const t = setTimeout(() => setClickCount(0), 3000);
      return () => clearTimeout(t);
    }
  }, [clickCount]);

  // Synchronize input fields with loaded branding values
  useEffect(() => {
    if (branding) {
      setBrandName(branding.companyName);
      setBrandLogo(branding.logoUrl);
      setBrandPrimary(branding.primaryColor);
      setBrandSecondary(branding.secondaryColor);
      setBrandBackground(branding.backgroundColor);
    }
  }, [branding]);

  const saveBranding = async () => {
    if (!game) return;
    try {
      const res = await fetch(`${API_BASE}/api/branding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          companyName: brandName,
          logoUrl: brandLogo,
          primaryColor: brandPrimary,
          secondaryColor: brandSecondary,
          backgroundColor: brandBackground
        })
      });
      
      const parsedPlaylist = playlistInput.split('\n').map(s => s.trim()).filter(Boolean);
      await saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled, brandPromoImage, promoImageDelay, parsedPlaylist);

      if (res.ok) {
        await refreshBranding();
        setShowSecretBranding(false);
      }
    } catch (err) {
      console.error('Failed to save branding:', err);
    }
  };

  const resetBrandingToDefault = async () => {
    if (!game) return;
    try {
      const res = await fetch(`${API_BASE}/api/branding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          companyName: 'Party Bingo',
          logoUrl: '',
          primaryColor: '#ec4899',
          secondaryColor: '#6366f1',
          backgroundColor: '#0d0526'
        })
      });
      if (res.ok) {
        await refreshBranding();
        setShowSecretBranding(false);
      }
    } catch (err) {
      console.error('Failed to reset branding:', err);
    }
  };

  const handleTitleClick = () => {
    setClickCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setShowSecretBranding(true);
        return 0;
      }
      return next;
    });
  };

  const shouldImmediatelyCall = React.useRef<boolean>(false);
  const gameIdRef = React.useRef<string | null>(null);
  const winTimeoutRef = React.useRef<any>(null);
  const lastCalledRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (game?.id) {
      gameIdRef.current = game.id;
    }
    const url = (game && 'redirect_url' in game && game.redirect_url) ? game.redirect_url : '';
    setRedirectUrlInput(url);
    if (game && 'redirect_delay' in game && game.redirect_delay !== undefined && game.redirect_delay !== null) {
      setRedirectDelay(game.redirect_delay);
    }
    if (game && 'auto_redirect_enabled' in game && game.auto_redirect_enabled !== undefined && game.auto_redirect_enabled !== null) {
      setAutoRedirectEnabled(game.auto_redirect_enabled === 1);
    }
  }, [game]);

  async function saveRedirectSettings(url: string, delay: number, enabled: boolean, promoImg?: string, promoDelay?: number, customPlaylist?: string[]) {
    if (!game) return;
    const pImg = promoImg !== undefined ? promoImg : brandPromoImage;
    const pDelay = promoDelay !== undefined ? promoDelay : promoImageDelay;
    const payload: any = { 
      gameId: game.id,
      redirectUrl: url,
      redirectDelay: delay,
      autoRedirectEnabled: enabled,
      promoImage: pImg,
      promoImageDelay: pDelay
    };
    if (customPlaylist !== undefined) {
      payload.playlist = customPlaylist;
    }
    try {
      const res = await fetch(`${API_BASE}/api/game/redirect-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchGame(game.id);
      }
    } catch (err) {
      console.error('Failed to save redirect settings:', err);
    }
  }

  const saveSpotifyCredentials = async () => {
    if (!game) return;
    try {
      const res = await fetch(`${API_BASE}/api/spotify/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          clientId: spotifyClientId,
          clientSecret: spotifyClientSecret
        })
      });
      if (res.ok) {
        alert('Spotify Credentials Saved!');
        await fetchGame(game.id);
      } else {
        alert('Failed to save Spotify Credentials');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const importSpotifyPlaylist = async () => {
    if (!game || !spotifyPlaylistUrl) return;
    try {
      const res = await fetch(`${API_BASE}/api/spotify/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          playlistUrl: spotifyPlaylistUrl
        })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully imported ${data.tracksCount} tracks from Spotify!`);
        await fetchGame(game.id);
      } else {
        const err = await res.json();
        alert(`Failed to import: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGame = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/game?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setGame(data);
        if (data.calledNumbers) {
          setCalledNumbers(data.calledNumbers);
          if (data.calledNumbers.length > 0) {
            lastCalledRef.current = data.calledNumbers[data.calledNumbers.length - 1];
          }
        }
        if (data.joinedPlayersCount !== undefined) {
          setJoinedCount(data.joinedPlayersCount);
        }
      } else {
        sessionStorage.removeItem('bingo_host_game_id');
        setGame(null);
      }
    } catch (error) {
      console.error('Failed to fetch game:', error);
    }
  }, []);

  const createRoom = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/game/create`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('bingo_host_game_id', data.id);
        setGame(data);
        await refreshBranding();
      }
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  };

  const closeRoom = () => {
    sessionStorage.removeItem('bingo_host_game_id');
    setGame(null);
    setCalledNumbers([]);
    setWinners([]);
    refreshBranding();
  };

  useEffect(() => {
    const savedId = sessionStorage.getItem('bingo_host_game_id');
    if (savedId) {
      fetchGame(savedId);
    }

    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/config`);
        const data = await res.json();
        setHostIp(data.hostIp);
      } catch (error) {
        console.error('Failed to fetch config:', error);
      }
    };
    fetchConfig();
  }, [fetchGame]);

  useEffect(() => {
    if (!game?.id) return;

    socket.connect();
    socket.emit('JOIN_ROOM', { gameId: game.id });

    socket.on('AUTO_NUMBER_SUGGESTION', (data: { number: number }) => {
      if (shouldImmediatelyCall.current) {
        shouldImmediatelyCall.current = false;
        const trackLoaded = audioFilesRef.current && audioFilesRef.current.some(t => t.id === data.number);
        if (trackLoaded) {
          playTrackRef.current(data.number);
        } else {
          socket.emit('ADMIN_CALL_NUMBER', { gameId: game.id, number: data.number });
        }
      }
    });

    socket.on('NUMBER_CALLED', (data: { number: number, allNumbers: number[] }) => {
      setCalledNumbers(data.allNumbers);
      lastCalledRef.current = data.number;
    });

    socket.on('WINNERS_UPDATE', (data: { winners: Winner[] }) => {
      setWinners(prev => [...prev, ...data.winners]);
      
      const activeWinners = data.winners.filter(w => w.type === 'LINE' || w.type === 'TWO_LINES' || w.type === 'FULL_HOUSE');
      if (activeWinners.length > 0) {
        const type = activeWinners[0].type;
        const winnersData = activeWinners.map(w => ({ id: w.id, name: w.name }));
        const winNum = lastCalledRef.current;
        
        setIsCallingPaused(true);
        setShowFireworks(true);
        
        if (winTimeoutRef.current) {
          clearTimeout(winTimeoutRef.current);
        }
        
        winTimeoutRef.current = setTimeout(() => {
          setPresenterWinOverlay({ type, winners: winnersData, winningNumber: winNum });
        }, 4000);
      }
    });

    socket.on('ROOM_CONNECTED_COUNT', (data: { count: number }) => {
      setConnectedCount(data.count);
    });

    socket.on('SPOTIFY_SYNC_STATUS', (data: { enabled: boolean }) => {
      setSpotifySyncEnabled(data.enabled);
    });

    socket.on('GAME_STARTED', () => fetchGame(game.id));
    socket.on('FINALE_STARTED', () => fetchGame(game.id));
    socket.on('GAME_FINISHED', () => fetchGame(game.id));
    socket.on('GAME_RESET', () => {
      fetchGame(game.id);
      setCalledNumbers([]);
      setWinners([]);
      setPresenterWinOverlay(null);
      setIsCallingPaused(false);
      setShowFireworks(false);
      lastCalledRef.current = null;
      setSpotifySyncEnabled(false);
      if (winTimeoutRef.current) {
        clearTimeout(winTimeoutRef.current);
        winTimeoutRef.current = null;
      }
    });

    return () => {
      socket.off('AUTO_NUMBER_SUGGESTION');
      socket.off('NUMBER_CALLED');
      socket.off('WINNERS_UPDATE');
      socket.off('ROOM_CONNECTED_COUNT');
      socket.off('SPOTIFY_SYNC_STATUS');
      socket.off('GAME_STARTED');
      socket.off('FINALE_STARTED');
      socket.off('GAME_FINISHED');
      socket.off('GAME_RESET');
      socket.disconnect();
      if (winTimeoutRef.current) {
        clearTimeout(winTimeoutRef.current);
      }
    };
  }, [game?.id, fetchGame]);

  const audioFilesRef = React.useRef<{ id: number; name: string; file: File }[]>([]);
  const playTrackRef = React.useRef<(id: number) => void>(() => {});
  
  useEffect(() => {
    audioFilesRef.current = audioFiles;
  }, [audioFiles]);

  const handleAudioFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.sort((a, b) => a.name.localeCompare(b.name));

    const tracks = files.map((file, index) => {
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const cleanName = nameWithoutExt.replace(/_/g, ' ').replace(/-/g, ' - ').trim();
      return {
        id: index + 1,
        name: cleanName,
        file
      };
    });

    setAudioFiles(tracks);

    const songNames = tracks.map(t => t.name);
    setPlaylist(songNames);
    setPlaylistInput(songNames.join('\n'));
    
    await saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled, brandPromoImage, promoImageDelay, songNames);
  };

  const playTrack = (id: number) => {
    const track = audioFilesRef.current.find(t => t.id === id);
    if (!track) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
    }

    if (currentPlayingId === id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
      return;
    }

    audioRef.current.pause();

    const objectUrl = URL.createObjectURL(track.file);
    audioRef.current.src = objectUrl;
    audioRef.current.play().then(() => {
      setCurrentPlayingId(id);
      setIsPlaying(true);
    }).catch(err => console.error('Audio play failed:', err));

    if (!calledNumbers.includes(id) && !isCallingPaused) {
      socket.emit('ADMIN_CALL_NUMBER', { gameId: game?.id, number: id });
    }
  };

  useEffect(() => {
    playTrackRef.current = playTrack;
  }, [playlist, audioFiles, calledNumbers, isCallingPaused, currentPlayingId, isPlaying]);

  const toggleSpotifySync = () => {
    if (!game) return;
    if (spotifySyncEnabled) {
      socket.emit('STOP_SPOTIFY_SYNC', { gameId: game.id });
    } else {
      socket.emit('START_SPOTIFY_SYNC', { gameId: game.id });
    }
  };

  const startGame = async () => {
    if (!game) return;
    await fetch(`${API_BASE}/api/game/start`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: game.id })
    });
  };

  const resetGame = async () => {
    if (!game) return;
    await fetch(`${API_BASE}/api/game/reset`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: game.id })
    });
  };

  const forceRedirect = () => {
    if (game?.id) {
      socket.emit('ADMIN_FORCE_REDIRECT', { gameId: game.id });
    }
  };

  const generateRandom = () => {
    if (!game || isCallingPaused) return;
    socket.emit('ADMIN_GET_AUTO_NUMBER', { gameId: game.id });
  };

  const autoCallNext = () => {
    if (!game || isCallingPaused) return;
    shouldImmediatelyCall.current = true;
    generateRandom();
  };

  const getCurrentStageText = () => {
    if (!game) return 'Loading...';
    if (game.status === 'WAITING') return 'Waiting for Host to Start';
    if (game.status === 'FINALE') return '🎉 Looking for FULL HOUSE!';
    if (game.status === 'FINISHED') return 'Game Over';
    
    const lineWin = winners.some(w => w.type === 'LINE') || game.lineWinOccurred;
    const twoLinesWin = winners.some(w => w.type === 'TWO_LINES') || game.twoLinesWinOccurred;
    
    if (!lineWin) return 'STAGE 1: Looking for LINE...';
    if (!twoLinesWin) return 'STAGE 2: Looking for TWO LINES...';
    return '🚀 STAGE 3: Looking for FULL HOUSE!';
  };

  if (!game) {
    return (
      <div className="card" style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center', padding: '2.5rem' }}>
        <h1 style={{ marginBottom: '1rem', fontWeight: 900 }}>Bingo Host Panel</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.05rem', lineHeight: '1.6' }}>
          Create a private bingo room instantly. Customize branding, show a real-time caller display, and manage winners. No registration or accounts required!
        </p>
        <button 
          onClick={createRoom} 
          style={{ 
            width: '100%', 
            padding: '1rem', 
            fontSize: '1.15rem', 
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
            boxShadow: '0 10px 20px rgba(236, 72, 153, 0.3)'
          }}
        >
          🚀 Create New Room
        </button>
        <div style={{ marginTop: '1.5rem' }}>
          <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>← Go to Player Screen</a>
        </div>
      </div>
    );
  }

  if (isPresenterMode) {
    const lastCalled = calledNumbers[calledNumbers.length - 1] || null;
    return (
      <div className="presenter-mode">
        <button className="exit-btn" style={{ zIndex: 10 }} onClick={() => setIsPresenterMode(false)}>✕ Exit Fullscreen</button>
        
        {showFireworks && !presenterWinOverlay && <FireworksCanvas zIndex={1} />}
        
        {presenterWinOverlay ? (
          <div className="win-announcement-overlay" style={{ background: 'rgba(13, 5, 38, 0.95)' }}>
            <FireworksCanvas />
            <div className="win-announcement-card" style={{ zIndex: 10001 }}>
              <Trophy size={80} style={{ color: 'var(--warning)', filter: 'drop-shadow(0 0 20px rgba(245, 158, 11, 0.6))' }} />
              <h1 className="win-announcement-title">
                {presenterWinOverlay.type === 'LINE' ? 'LINE BINGO!' : presenterWinOverlay.type === 'TWO_LINES' ? 'TWO LINES BINGO!' : 'FULL HOUSE BINGO!'}
              </h1>

              {presenterWinOverlay.winningNumber && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Winning Number</span>
                  <div className="bingo-ball active" style={{ width: '100px', height: '100px', animation: 'none' }}>
                    <span className="ball-inner" style={{ width: '55px', height: '55px' }}>
                      <span className="ball-number" style={{ fontSize: '1.85rem' }}>{presenterWinOverlay.winningNumber}</span>
                    </span>
                  </div>
                </div>
              )}

              {presenterWinOverlay.type === 'FULL_HOUSE' ? (
                <p className="win-announcement-subtitle" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', marginTop: '1rem' }}>
                  🎉 EVERYONE WINS! 🎉
                </p>
              ) : (
                <>
                  <p className="win-announcement-subtitle" style={{ fontSize: '1.25rem' }}>
                    Winner{presenterWinOverlay.winners.length > 1 ? 's' : ''}:
                  </p>
                  <div className="win-announcement-players">
                    {presenterWinOverlay.winners.map(w => (
                      <div key={w.id} className="win-announcement-player">
                        {w.name || `Player ${w.id.slice(0, 8)}`}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button 
                className="win-announcement-close-btn" 
                onClick={() => {
                  setPresenterWinOverlay(null);
                  setIsCallingPaused(false);
                  setShowFireworks(false);
                }}
              >
                {presenterWinOverlay.type === 'FULL_HOUSE' ? 'Close' : 'Resume Calling'}
              </button>
            </div>
          </div>
        ) : (
          <div className="presenter-content" style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              {branding?.logoUrl && (
                <img 
                  src={branding.logoUrl} 
                  alt="Company Logo" 
                  style={{ maxHeight: '80px', maxWidth: '300px', objectFit: 'contain', marginBottom: '1rem' }} 
                />
              )}
              <div className="stage-indicator">
                {getCurrentStageText()}
              </div>
            </div>
            
            <div className="presenter-ball-wrapper" onClick={autoCallNext}>
              <div key={lastCalled} className={`bingo-ball giant ${(lastCalled && playlist[lastCalled - 1]) ? 'active' : 'idle'}`} style={{ 
                borderRadius: '2.5rem', 
                width: 'auto', 
                minWidth: '380px', 
                maxWidth: '90%',
                padding: '2.5rem 3rem',
                height: 'auto',
                aspectRatio: 'auto',
                margin: '2rem auto'
              }}>
                <span className="ball-inner" style={{ 
                  borderRadius: '2rem', 
                  width: '100%', 
                  height: '100%',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '4px', fontWeight: 800 }}>Now Playing</span>
                  <span className="ball-number" style={{ 
                    fontSize: '2rem', 
                    whiteSpace: 'normal', 
                    wordBreak: 'break-word',
                    lineHeight: '1.3'
                  }}>
                    {(lastCalled && (typeof playlist[lastCalled - 1] === 'object' && playlist[lastCalled - 1] !== null ? (playlist[lastCalled - 1] as any).name : playlist[lastCalled - 1])) || 'Waiting...'}
                  </span>
                </span>
              </div>
            </div>
            
            <div className="presenter-hint">
              {isCallingPaused ? (
                <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>WIN DETECTED! Calling paused...</span>
              ) : (
                lastCalled ? 'Tap ball to call next number' : 'Tap ball to start calling'
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Secret Branding Modal */}
      {showSecretBranding && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(13, 5, 38, 0.85)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 20000,
          backdropFilter: 'blur(8px)',
          padding: '1rem'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', border: '2px solid var(--accent)', margin: 0 }}>
            <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>🤫 Secret Branding Settings</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Company / Event Name</label>
                <input 
                  type="text" 
                  value={brandName} 
                  onChange={e => setBrandName(e.target.value)} 
                  placeholder="e.g. Acme Corp Bingo" 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Company Logo Image</label>
                {brandLogo && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '0.75rem' }}>
                    <img src={brandLogo} alt="Logo Preview" style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain' }} />
                    <button 
                      type="button"
                      onClick={() => setBrandLogo('')}
                      style={{ 
                        background: 'var(--danger)', 
                        padding: '0.25rem 0.75rem', 
                        fontSize: '0.75rem', 
                        borderRadius: '0.5rem',
                        boxShadow: 'none'
                      }}
                    >
                      Remove Logo
                    </button>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setBrandLogo(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }}
                  style={{ fontSize: '0.875rem', padding: '0.5rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Playlist (one song per line):
                </label>
                <textarea 
                  value={playlistInput} 
                  onChange={e => setPlaylistInput(e.target.value)}
                  placeholder="Song 1&#10;Song 2&#10;Song 3..."
                  rows={8}
                  style={{ 
                    width: '100%', 
                    background: 'rgba(0,0,0,0.2)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '0.75rem', 
                    color: 'white', 
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    resize: 'vertical'
                  }}
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Provide at least 9 songs. Changes apply to new games or resets.
                </p>
              </div>

              {/* Spotify API Credentials & Playlist Importer */}
              <div style={{
                background: 'rgba(29, 185, 84, 0.05)',
                border: '1px solid rgba(29, 185, 84, 0.15)',
                padding: '1rem',
                borderRadius: '0.75rem',
                textAlign: 'left'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1db954', display: 'block', marginBottom: '0.5rem' }}>
                  🟢 Spotify Auto Play Integration
                </span>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
                  Provide Spotify Client ID & Client Secret from <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: '#1db954', textDecoration: 'underline' }}>Spotify Developer Portal</a>. Set Redirect URI to: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.25rem', borderRadius: '0.25rem', fontSize: '0.65rem' }}>{window.location.origin}/api/spotify/callback</code>
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input 
                    type="text" 
                    placeholder="Spotify Client ID" 
                    value={spotifyClientId} 
                    onChange={e => setSpotifyClientId(e.target.value)} 
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  />
                  <input 
                    type="password" 
                    placeholder="Spotify Client Secret" 
                    value={spotifyClientSecret} 
                    onChange={e => setSpotifyClientSecret(e.target.value)} 
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  />
                  <button 
                    onClick={saveSpotifyCredentials} 
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', height: 'auto', background: '#1db954', color: 'white', border: 'none', margin: 0 }}
                  >
                    Save Credentials
                  </button>
                </div>

                {spotifyClientId && spotifyClientSecret && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Status: {spotifyConnected ? <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Connected ✅</span> : <span style={{ color: 'var(--warning)', fontWeight: 'bold' }}>Disconnected ❌</span>}
                    </label>
                    <a 
                      href={`${API_BASE}/api/spotify/login?gameId=${game?.id}`}
                      className="button"
                      style={{ 
                        display: 'block', 
                        textAlign: 'center', 
                        background: spotifyConnected ? 'rgba(255,255,255,0.05)' : '#1db954', 
                        color: 'white', 
                        fontSize: '0.75rem', 
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.5rem',
                        fontWeight: 'bold',
                        border: spotifyConnected ? '1px solid rgba(255,255,255,0.1)' : 'none'
                      }}
                    >
                      {spotifyConnected ? 'Re-Connect Spotify Account' : 'Connect Spotify Account'}
                    </a>

                    {spotifyConnected && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Import Spotify Playlist URL</label>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <input 
                            type="text" 
                            placeholder="https://open.spotify.com/playlist/..." 
                            value={spotifyPlaylistUrl} 
                            onChange={e => setSpotifyPlaylistUrl(e.target.value)} 
                            style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem', flex: 1 }}
                          />
                          <button 
                            onClick={importSpotifyPlaylist} 
                            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', height: 'auto', background: 'var(--secondary)', border: 'none', margin: 0 }}
                          >
                            Import
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center' }}>Primary</label>
                  <input 
                    type="color" 
                    value={brandPrimary} 
                    onChange={e => setBrandPrimary(e.target.value)} 
                    style={{ padding: 0, height: '40px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center' }}>Secondary</label>
                  <input 
                    type="color" 
                    value={brandSecondary} 
                    onChange={e => setBrandSecondary(e.target.value)} 
                    style={{ padding: 0, height: '40px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center' }}>Bg Color</label>
                  <input 
                    type="color" 
                    value={brandBackground} 
                    onChange={e => setBrandBackground(e.target.value)} 
                    style={{ padding: 0, height: '40px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button onClick={saveBranding} style={{ flex: 1 }}>Save</button>
                <button onClick={resetBrandingToDefault} style={{ background: 'var(--danger)', flex: 1 }}>Reset</button>
              </div>

              <button 
                onClick={() => setShowSecretBranding(false)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', width: '100%', fontSize: '0.875rem' }}
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '1rem', 
          marginBottom: '1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '1rem'
        }}>
          <div 
            onClick={handleTitleClick}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              cursor: 'pointer', 
              userSelect: 'none'
            }}
            title="Tapping this 5 times opens branding settings"
          >
            {branding?.logoUrl && (
              <img src={branding.logoUrl} alt="Logo" style={{ height: '36px', maxWidth: '100px', objectFit: 'contain' }} />
            )}
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{branding?.companyName || 'Host Dashboard'}</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => setShowSecretBranding(true)}
              style={{
                padding: '0.5rem',
                borderRadius: '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                boxShadow: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
              title="Branding Settings"
            >
              ⚙️
            </button>
            <button 
              onClick={resetBrandingToDefault}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                background: 'rgba(255, 255, 255, 0.05)',
                boxShadow: 'none',
                fontSize: '0.85rem',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
              title="Reset to default theme"
            >
              Reset Theme
            </button>
            <button 
              onClick={closeRoom}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                background: 'var(--danger)',
                boxShadow: 'none',
                fontSize: '0.85rem',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
              title="Close and exit room dashboard"
            >
              Leave Room
            </button>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-box">
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>STATUS</div>
            <div style={{ fontWeight: 800, color: 'var(--accent)' }}>{game.status}</div>
          </div>
          <div className="stat-box">
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>CALLED</div>
            <div style={{ fontWeight: 800 }}>{calledNumbers.length}</div>
          </div>
          <div className="stat-box">
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>PLAYERS</div>
            <div style={{ fontWeight: 800 }}>
              {Math.max(0, connectedCount - 1)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>active</span>
              {' / '}{joinedCount} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>total</span>
            </div>
          </div>
          <div className="stat-box">
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>ROOM CODE</div>
            <div style={{ fontWeight: 800, color: 'var(--secondary)', letterSpacing: '1px' }}>{game.room_code || '---'}</div>
          </div>
        </div>

        <div className="admin-controls" style={{ marginTop: '2rem' }}>
          {game.status === 'WAITING' && (
            <button onClick={startGame} style={{ width: '100%' }}>Start Game</button>
          )}
          
          {(game.status === 'STARTED' || game.status === 'FINALE') && (
            <>
              {isCallingPaused && (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '1.25rem',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                  textAlign: 'center',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                }}>
                  <span style={{ color: 'var(--warning)', fontWeight: 800, fontSize: '1.1rem' }}>⚠️ Calling Paused (Win Detected)</span>
                  <button 
                    onClick={() => {
                      setIsCallingPaused(false);
                      setShowFireworks(false);
                      setPresenterWinOverlay(null);
                    }}
                    style={{ 
                      width: '100%', 
                      background: 'linear-gradient(135deg, var(--success) 0%, #047857 100%)',
                      padding: '0.75rem 1.25rem',
                      fontSize: '1rem',
                      borderRadius: '0.875rem'
                    }}
                  >
                    Resume Calling
                  </button>
                </div>
              )}

              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.1)',
                padding: '1.25rem',
                borderRadius: '1rem',
                marginBottom: '1.25rem',
                textAlign: 'left'
              }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  🎵 Play Mode Options:
                </label>
                
                {/* Spotify Desktop Sync Option */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '0.75rem', 
                  background: 'rgba(29, 185, 84, 0.08)', 
                  border: '1px solid rgba(29, 185, 84, 0.2)', 
                  borderRadius: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1db954', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      🟢 Spotify Desktop Sync
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Auto-call songs playing on your local Windows Spotify app!
                    </span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={spotifySyncEnabled}
                    onChange={toggleSpotifySync}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#1db954' }}
                    disabled={game?.status !== 'STARTED'}
                    title={game?.status !== 'STARTED' ? 'Start the game first to enable Spotify Sync' : 'Toggle Spotify Sync'}
                  />
                </div>
                {audioFiles.length > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 'bold' }}>
                      ✅ {audioFiles.length} Audio Tracks Loaded
                    </span>
                    <button 
                      onClick={() => {
                        setAudioFiles([]);
                        if (audioRef.current) {
                          audioRef.current.pause();
                        }
                        setIsPlaying(false);
                        setCurrentPlayingId(null);
                      }}
                      style={{ background: 'var(--danger)', fontSize: '0.75rem', padding: '0.25rem 0.75rem', height: 'auto', width: 'auto', boxShadow: 'none' }}
                    >
                      Clear Tracks
                    </button>
                  </div>
                ) : (
                  <div>
                    <input 
                      type="file" 
                      multiple 
                      accept="audio/*" 
                      onChange={handleAudioFilesChange}
                      id="audio-selector"
                      style={{ display: 'none' }}
                    />
                    <label 
                      htmlFor="audio-selector" 
                      className="button"
                      style={{ 
                        display: 'block', 
                        textAlign: 'center', 
                        background: 'var(--secondary)', 
                        padding: '0.6rem 1rem', 
                        borderRadius: '0.75rem',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        margin: 0
                      }}
                    >
                      📂 Load Audio Files (.mp3 / .wav)
                    </label>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.5rem 0 0 0', textAlign: 'center' }}>
                      Upload actual tracks to play them directly from this dashboard!
                    </p>
                  </div>
                )}
              </div>

              {audioFiles.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '0.25rem', textAlign: 'left' }}>Click track to Play & Call:</div>
                    {audioFiles.map(track => {
                      const isTrackCalled = calledNumbers.includes(track.id);
                      const isTrackPlaying = currentPlayingId === track.id && isPlaying;
                      return (
                        <div 
                          key={track.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            background: isTrackPlaying ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)', 
                            border: isTrackPlaying ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)',
                            padding: '0.5rem 0.75rem', 
                            borderRadius: '0.75rem',
                            opacity: isTrackCalled && !isTrackPlaying ? 0.5 : 1
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textAlign: 'left' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>#{track.id}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: isTrackPlaying ? 'bold' : 'normal', color: isTrackPlaying ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={track.name}>
                              {track.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button 
                              onClick={() => playTrack(track.id)}
                              disabled={isCallingPaused}
                              style={{ 
                                background: isTrackPlaying ? 'var(--accent)' : 'var(--secondary)', 
                                fontSize: '0.75rem', 
                                padding: '0.25rem 0.75rem',
                                height: 'auto',
                                width: 'auto',
                                boxShadow: 'none'
                              }}
                            >
                              {isTrackPlaying ? '⏸️ Pause' : '▶️ Play'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={autoCallNext} 
                      disabled={isCallingPaused} 
                      style={{ 
                        flex: 1, 
                        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                        fontWeight: 'bold',
                        opacity: isCallingPaused ? 0.5 : 1
                      }}
                    >
                      🎵 Auto Play Next Song
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', marginBottom: '0.25rem', textAlign: 'left' }}>Click Call or Play on Spotify:</div>
                    {playlist
                      .map((song, index) => ({ song, id: index + 1 }))
                      .filter(item => !calledNumbers.includes(item.id))
                      .map(item => (
                        <div 
                          key={item.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            background: 'rgba(255,255,255,0.02)', 
                            border: '1px solid rgba(255,255,255,0.05)',
                            padding: '0.5rem 0.75rem', 
                            borderRadius: '0.75rem',
                            gap: '0.5rem'
                          }}
                        >
                          <span 
                            style={{ fontSize: '0.85rem', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} 
                            title={typeof item.song === 'object' && item.song !== null ? (item.song as any).name : item.song}
                          >
                            {typeof item.song === 'object' && item.song !== null ? (item.song as any).name : item.song}
                          </span>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button 
                              onClick={() => {
                                socket.emit('ADMIN_CALL_NUMBER', { gameId: game?.id, number: item.id });
                              }}
                              disabled={isCallingPaused}
                              style={{ 
                                background: 'var(--secondary)', 
                                fontSize: '0.75rem', 
                                padding: '0.25rem 0.6rem',
                                height: 'auto',
                                width: 'auto',
                                boxShadow: 'none',
                                margin: 0
                              }}
                            >
                              Call
                            </button>
                            <button 
                              onClick={() => {
                                const songTitle = typeof item.song === 'object' && item.song !== null ? (item.song as any).name : item.song;
                                socket.emit('ADMIN_CALL_NUMBER', { gameId: game?.id, number: item.id });
                                window.open(`https://open.spotify.com/search/${encodeURIComponent(songTitle)}`, '_blank');
                              }}
                              disabled={isCallingPaused}
                              style={{ 
                                background: '#1db954', 
                                color: 'white',
                                fontSize: '0.75rem', 
                                padding: '0.25rem 0.6rem',
                                height: 'auto',
                                width: 'auto',
                                boxShadow: 'none',
                                margin: 0
                              }}
                            >
                              🎵 Spotify
                            </button>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={autoCallNext} 
                      disabled={isCallingPaused} 
                      style={{ 
                        flex: 1, 
                        background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                        fontWeight: 'bold',
                        opacity: isCallingPaused ? 0.5 : 1
                      }}
                    >
                      🎲 Auto Select Next Song
                    </button>
                  </div>
                </>
              )}

              <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Called Songs History:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {calledNumbers.slice().reverse().map((num, idx) => (
                    <div key={num} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.75rem', borderRadius: '0.5rem' }}>
                      <span>{(() => {
                        const item = playlist[num - 1];
                        return item ? (typeof item === 'object' && item !== null ? (item as any).name : item) : `Song #${num}`;
                      })()}</span>
                      <span style={{ opacity: 0.5 }}>#{calledNumbers.length - idx}</span>
                    </div>
                  ))}
                  {calledNumbers.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No songs called yet.</div>
                  )}
                </div>
              </div>
              
              <div style={{ 
                background: 'rgba(99, 102, 241, 0.1)', 
                border: '1px solid rgba(99, 102, 241, 0.2)', 
                borderRadius: '1.25rem', 
                padding: '1.25rem', 
                marginTop: '1.25rem',
                textAlign: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                color: 'var(--accent)',
                boxShadow: 'inset 0 0 10px rgba(99, 102, 241, 0.05)'
              }}>
                {getCurrentStageText()}
              </div>

              <button 
                onClick={() => setIsPresenterMode(true)} 
                style={{ width: '100%', marginTop: '1.25rem', background: 'linear-gradient(135deg, var(--secondary) 0%, var(--accent) 100%)' }}
              >
                📺 Display Fullscreen (Presenter Mode)
              </button>
            </>
          )}

          <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Optional End of Game Redirect URL:
              </label>
              <input 
                type="text" 
                value={redirectUrlInput} 
                onChange={e => setRedirectUrlInput(e.target.value)}
                onBlur={() => saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled)}
                placeholder="e.g., https://instagram.com/yourprofile"
                style={{ width: '100%', marginBottom: '0.75rem' }}
              />
              {redirectUrlInput && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="auto-redirect-toggle" style={{ fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }}>
                        Auto-redirect players at game end
                      </label>
                      <input 
                        id="auto-redirect-toggle"
                        type="checkbox" 
                        checked={autoRedirectEnabled} 
                        onChange={e => {
                          const val = e.target.checked;
                          setAutoRedirectEnabled(val);
                          saveRedirectSettings(redirectUrlInput, redirectDelay, val);
                        }}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                    </div>

                    {autoRedirectEnabled && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          <span>Redirect Delay:</span>
                          <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{redirectDelay} seconds</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="60" 
                          step="5"
                          value={redirectDelay} 
                          onChange={e => {
                            setRedirectDelay(Number(e.target.value));
                          }}
                          onMouseUp={e => {
                            saveRedirectSettings(redirectUrlInput, Number((e.target as HTMLInputElement).value), autoRedirectEnabled);
                          }}
                          onTouchEnd={e => {
                            saveRedirectSettings(redirectUrlInput, Number((e.target as HTMLInputElement).value), autoRedirectEnabled);
                          }}
                          style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
                        />
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled).then(() => {
                        forceRedirect();
                      });
                    }} 
                    style={{ 
                      width: '100%', 
                      background: 'var(--accent)',
                      fontSize: '1rem',
                      padding: '0.75rem 1.25rem'
                    }}
                  >
                    🚀 Redirect All Players Now
                  </button>
                </>
              )}
            </div>

            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1.25rem', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                End-of-Game Flyer / Promo Image (offline-friendly):
              </label>
              {brandPromoImage && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <img src={brandPromoImage} alt="Promo Flyer Preview" style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain', borderRadius: '0.75rem' }} />
                  
                  <div style={{ width: '100%', marginTop: '0.5rem', marginBottom: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      <span>Flyer Popup Delay:</span>
                      <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{promoImageDelay} seconds</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="60" 
                      step="5"
                      value={promoImageDelay} 
                      onChange={e => {
                        setPromoImageDelay(Number(e.target.value));
                      }}
                      onMouseUp={e => {
                        saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled, brandPromoImage, Number((e.target as HTMLInputElement).value));
                      }}
                      onTouchEnd={e => {
                        saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled, brandPromoImage, Number((e.target as HTMLInputElement).value));
                      }}
                      style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      setBrandPromoImage('');
                      saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled, '', 0);
                    }}
                    style={{ 
                      background: 'var(--danger)', 
                      padding: '0.35rem 1rem', 
                      fontSize: '0.8rem', 
                      borderRadius: '0.5rem',
                      boxShadow: 'none',
                      height: 'auto',
                      width: 'auto'
                    }}
                  >
                    Remove Flyer
                  </button>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64 = reader.result as string;
                    setBrandPromoImage(base64);
                    saveRedirectSettings(redirectUrlInput, redirectDelay, autoRedirectEnabled, base64);
                  };
                  reader.readAsDataURL(file);
                }}
                style={{ fontSize: '0.875rem', padding: '0.5rem 0' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
                If uploaded, this image will pop up on player devices after the delay.
              </p>
            </div>
          </div>

          <button 
            onClick={resetGame} 
            style={{ 
              width: '100%', 
              marginTop: '2rem', 
              background: 'var(--secondary)',
              boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
            }}
          >
            Reset Entire Game
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <h3>Scan to Play</h3>
        {(() => {
          const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const joinUrl = isLocalHost
            ? `${window.location.protocol}//${hostIp}${window.location.port ? `:${window.location.port}` : ''}/?room=${game.room_code}`
            : `${window.location.protocol}//${window.location.host}/?room=${game.room_code}`;
          
          return (
            <>
              <div style={{ background: 'white', padding: '1rem', borderRadius: '1.25rem', display: 'inline-block', margin: '1rem 0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
                {qrCodeUrl ? (
                  <img 
                    src={qrCodeUrl} 
                    alt="Scan to join" 
                    style={{ display: 'block', width: '160px', height: '160px' }}
                  />
                ) : (
                  <div style={{ width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d0526' }}>
                    Generating...
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', wordBreak: 'break-all', margin: 0 }}>
                Open this URL on your phone:<br/>
                <a href={joinUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 800, textDecoration: 'underline' }}>
                  {joinUrl}
                </a>
              </p>
            </>
          );
        })()}
      </div>

      <div className="card">
        <h3>Live Winners</h3>
        <div className="winners-list">
          {winners.filter(w => w.type !== 'FULL_HOUSE').length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              {winners.some(w => w.type === 'FULL_HOUSE') ? 'Everyone won! (Full House)' : 'Waiting for winners...'}
            </p>
          )}
          {winners.filter(w => w.type !== 'FULL_HOUSE').map((w, i) => (
            <div key={i} className="winner-item">
              <strong>{w.type}</strong>
              <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                {w.name ? `${w.name} (ID: ${w.id.slice(0, 8)})` : `ID: ${w.id.slice(0, 8)}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

