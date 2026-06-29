
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '../App';
import type { Branding } from '../App';


const API_BASE = window.location.port === '5173'
  ? `http://${window.location.hostname}:3001`
  : `${window.location.protocol}//${window.location.host}`;

const JoinPage: React.FC = () => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase();
  });
  const isPreFilled = new URLSearchParams(window.location.search).has('room');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { branding } = useBranding();
  const [customBranding, setCustomBranding] = useState<Branding | null>(null);

  // Load custom branding dynamically once a 5-digit room code is typed
  useEffect(() => {
    const cleanedCode = roomCode.trim();
    if (cleanedCode.length === 5) {
      const getRoomBranding = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/branding?roomCode=${cleanedCode}`);
          if (res.ok) {
            const data = await res.json();
            setCustomBranding(data);
            if (data.primaryColor) {
              document.documentElement.style.setProperty('--primary', data.primaryColor);
            }
            if (data.secondaryColor) {
              document.documentElement.style.setProperty('--secondary', data.secondaryColor);
            }
            if (data.backgroundColor) {
              document.documentElement.style.setProperty('--background', data.backgroundColor);
            }
          }
        } catch (err) {
          console.error('Failed to load room branding:', err);
        }
      };
      getRoomBranding();
    } else {
      setCustomBranding(null);
      // Restore default branding
      if (branding) {
        if (branding.primaryColor) document.documentElement.style.setProperty('--primary', branding.primaryColor);
        if (branding.secondaryColor) document.documentElement.style.setProperty('--secondary', branding.secondaryColor);
        if (branding.backgroundColor) document.documentElement.style.setProperty('--background', branding.backgroundColor);
      }
    }
  }, [roomCode, branding]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/game/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, roomCode: roomCode.toUpperCase().trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        sessionStorage.setItem('bingo_player', JSON.stringify(data));
        navigate('/game');
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to join game');
      }
    } catch (error) {
      console.error('Failed to join game:', error);
      setError('Connection error. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  const activeBranding = customBranding || branding;

  return (
    <div className="card" style={{ marginTop: '4rem' }}>
      {activeBranding?.logoUrl && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <img 
            src={activeBranding.logoUrl} 
            alt="Company Logo" 
            style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }} 
          />
        </div>
      )}
      <h1 style={{ textAlign: 'center' }}>{activeBranding?.companyName || 'Musical Bingo'}</h1>
      <p style={{ textAlign: 'center', color: 'var(--secondary)' }}>
        Enter your details to join the game!
      </p>
      
      {error && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid rgba(239, 68, 68, 0.3)', 
          color: '#f87171', 
          padding: '0.75rem', 
          borderRadius: '0.75rem', 
          textAlign: 'center',
          fontSize: '0.875rem' 
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input
          type="text"
          placeholder="Room Code (e.g. X9F2D)"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          disabled={isPreFilled}
          required
          maxLength={5}
          style={{ textTransform: 'uppercase', textAlign: 'center', fontWeight: 'bold', letterSpacing: '2px' }}
        />
        
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        
        <button type="submit" disabled={loading}>
          {loading ? 'Joining...' : 'Join Game'}
        </button>
      </form>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <a href="/admin" style={{ color: 'var(--secondary)', fontSize: '0.875rem' }}>Admin Dashboard</a>
      </div>
    </div>
  );
};

export default JoinPage;

