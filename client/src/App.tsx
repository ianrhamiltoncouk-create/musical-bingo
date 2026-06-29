import { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import JoinPage from './pages/JoinPage';
import GamePage from './pages/GamePage';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

const API_BASE = window.location.port === '5173'
  ? `http://${window.location.hostname}:3001`
  : `${window.location.protocol}//${window.location.host}`;

export interface Branding {
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

interface BrandingContextType {
  branding: Branding | null;
  refreshBranding: () => Promise<void>;
}

export const BrandingContext = createContext<BrandingContextType>({
  branding: null,
  refreshBranding: async () => {},
});

export const useBranding = () => useContext(BrandingContext);

function App() {
  const [branding, setBranding] = useState<Branding | null>(null);

  const refreshBranding = async () => {
    try {
      const hostGameId = sessionStorage.getItem('bingo_host_game_id');
      const playerSaved = sessionStorage.getItem('bingo_player');
      let url = `${API_BASE}/api/branding`;
      
      if (hostGameId) {
        url += `?gameId=${hostGameId}`;
      } else if (playerSaved) {
        try {
          const playerData = JSON.parse(playerSaved);
          if (playerData.gameId) {
            url += `?gameId=${playerData.gameId}`;
          }
        } catch (e) {}
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBranding(data);
        
        // Dynamically inject custom styles
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
      console.error('Failed to load branding:', err);
    }
  };



  useEffect(() => {
    refreshBranding();
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, refreshBranding }}>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<JoinPage />} />
            <Route path="/game" element={<GamePage />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Routes>
        </div>
      </Router>
    </BrandingContext.Provider>
  );
}

export default App;
