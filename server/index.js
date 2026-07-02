const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { initDb, getDb } = require('./db');
const { generateMusicalCard, generatePartyClimaxCard, checkWin } = require('./bingoLogic');
const { exec } = require('child_process');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const path = require('path');
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

const DEFAULT_PLAYLIST = [
  "Billie Jean - Michael Jackson",
  "Bohemian Rhapsody - Queen",
  "Stayin' Alive - Bee Gees",
  "Dancing Queen - ABBA",
  "Sweet Child O' Mine - Guns N' Roses",
  "Hotel California - Eagles",
  "Imagine - John Lennon",
  "Purple Rain - Prince",
  "Smells Like Teen Spirit - Nirvana",
  "Wonderwall - Oasis",
  "Hey Jude - The Beatles",
  "Like a Rolling Stone - Bob Dylan",
  "What's Going On - Marvin Gaye",
  "Respect - Aretha Franklin",
  "Good Vibrations - The Beach Boys",
  "I Want to Hold Your Hand - The Beatles",
  "Superstition - Stevie Wonder",
  "Hound Dog - Elvis Presley",
  "Johnny B. Goode - Chuck Berry",
  "Blue Suede Shoes - Elvis Presley",
  "Satisfaction - The Rolling Stones",
  "Yesterday - The Beatles",
  "My Girl - The Temptations",
  "Stand by Me - Ben E. King",
  "Ain't No Mountain High Enough - Marvin Gaye & Tammi Terrell",
  "Suspicious Minds - Elvis Presley",
  "Bridge Over Troubled Water - Simon & Garfunkel",
  "Born to Run - Bruce Springsteen",
  "Go Your Own Way - Fleetwood Mac",
  "Every Breath You Take - The Police",
  "With or Without You - U2",
  "Beat It - Michael Jackson",
  "Take On Me - A-ha",
  "Girls Just Want to Have Fun - Cyndi Lauper",
  "Livin' on a Prayer - Bon Jovi",
  "Sweet Caroline - Neil Diamond",
  "Don't Stop Believin' - Journey",
  "Karma Chameleon - Culture Club",
  "Wake Me Up Before You Go-Go - Wham!",
  "Summer of '69 - Bryan Adams",
  "Africa - Toto",
  "Eye of the Tiger - Survivor",
  "Total Eclipse of the Heart - Bonnie Tyler",
  "Under Pressure - Queen & David Bowie",
  "Radio Ga Ga - Queen",
  "Rocket Man - Elton John",
  "Tiny Dancer - Elton John",
  "Piano Man - Billy Joel",
  "Uptown Girl - Billy Joel",
  "September - Earth, Wind & Fire"
];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function generateUniqueRoomCode(db) {
  let attempts = 0;
  while (attempts < 100) {
    const code = generateRoomCode();
    const existing = await db.get('SELECT id FROM games WHERE room_code = ?', [code]);
    if (!existing) {
      return code;
    }
    attempts++;
  }
  return uuidv4().slice(0, 5).toUpperCase();
}

async function refreshSpotifyToken(gameId) {
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game || !game.spotify_refresh_token) {
    return null;
  }
  
  const clientId = game.spotify_client_id || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = game.spotify_client_secret || process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', game.spotify_refresh_token);
    
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    if (!response.ok) {
      console.error('Failed to refresh Spotify token:', await response.text());
      return null;
    }
    
    const data = await response.json();
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token || game.spotify_refresh_token;
    
    await db.run('UPDATE games SET spotify_access_token = ?, spotify_refresh_token = ? WHERE id = ?', [newAccessToken, newRefreshToken, gameId]);
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing Spotify token:', error);
    return null;
  }
}

async function playSpotifyTrack(gameId, trackUri) {
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game || !game.spotify_access_token) return;

  const triggerPlay = async (token) => {
    const playRes = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris: [trackUri] })
    });
    
    if (playRes.status === 401) {
      const freshToken = await refreshSpotifyToken(gameId);
      if (freshToken) {
        await fetch('https://api.spotify.com/v1/me/player/play', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${freshToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uris: [trackUri] })
        });
      }
    } else if (playRes.status === 404) {
      console.warn('[Spotify Play] No active Spotify device found. Please play a song in Spotify first.');
    }
  };

  await triggerPlay(game.spotify_access_token);
}

// REST Endpoints

app.get('/api/config', (req, res) => {
  res.json({ 
    hostIp: getLocalIp(),
    spotifyConfigured: !!process.env.SPOTIFY_CLIENT_ID
  });
});

// Branding endpoints (scoped by game room or defaulted)
app.get('/api/branding', async (req, res) => {
  try {
    const { roomCode, gameId } = req.query;
    const db = getDb();
    let game;

    if (roomCode) {
      game = await db.get('SELECT * FROM games WHERE room_code = ?', [roomCode.toUpperCase().trim()]);
    } else if (gameId) {
      game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    }

    if (game) {
      res.json({
        companyName: game.company_name,
        logoUrl: game.logo_url,
        primaryColor: game.primary_color,
        secondaryColor: game.secondary_color,
        backgroundColor: game.background_color
      });
    } else {
      res.json({
        companyName: 'Party Bingo',
        logoUrl: '',
        primaryColor: '#ec4899',
        secondaryColor: '#6366f1',
        backgroundColor: '#0d0526'
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/branding', async (req, res) => {
  const { gameId, companyName, logoUrl, primaryColor, secondaryColor, backgroundColor } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  try {
    const db = getDb();
    await db.run(
      `UPDATE games SET 
         company_name = ?, 
         logo_url = ?, 
         primary_color = ?, 
         secondary_color = ?, 
         background_color = ? 
       WHERE id = ?`,
      [companyName, logoUrl, primaryColor, secondaryColor, backgroundColor, gameId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new game room with default playlist
app.post('/api/game/create', async (req, res) => {
  const { 
    gameType, 
    gameMode, 
    licenseKey, 
    deviceId,
    gridSize,
    freeSpaceEnabled,
    timeLimitEnabled,
    durationLimit,
    snippetLimit
  } = req.body;
  const db = getDb();

  // Validate license
  if (!licenseKey || !deviceId) {
    return res.status(400).json({ error: 'LICENSE_REQUIRED', message: 'A license key and device ID are required to host games.' });
  }

  try {
    const license = await db.get('SELECT * FROM licenses WHERE license_key = ?', [licenseKey.trim()]);
    if (!license) {
      return res.status(403).json({ error: 'INVALID_KEY', message: 'Invalid license key.' });
    }
    if (license.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'SUSPENDED', message: 'This license has been suspended.' });
    }
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(403).json({ error: 'EXPIRED', message: 'This license has expired.' });
    }
    if (license.device_id_1 !== deviceId && license.device_id_2 !== deviceId) {
      return res.status(403).json({ error: 'DEVICE_LOCKED', message: 'This license is locked to other devices.' });
    }

    const newGameId = uuidv4();
    const roomCode = await generateUniqueRoomCode(db);
    
    const type = gameType || 'MUSIC';
    const mode = gameMode || 'SINGLE_WINNER';
    const playlistJson = type === 'MUSIC' ? JSON.stringify(DEFAULT_PLAYLIST) : null;
    
    const targetLineInt = req.body.targetLine !== undefined ? (req.body.targetLine ? 1 : 0) : 1;
    const targetTwoLinesInt = req.body.targetTwoLines !== undefined ? (req.body.targetTwoLines ? 1 : 0) : 1;
    const targetFullHouseInt = req.body.targetFullHouse !== undefined ? (req.body.targetFullHouse ? 1 : 0) : 1;
    
    const gridSz = gridSize !== undefined ? Number(gridSize) : 3;
    const freeSp = freeSpaceEnabled ? 1 : 0;
    const timeLim = timeLimitEnabled ? 1 : 0;
    const durLim = durationLimit !== undefined ? Number(durationLimit) : 15;
    const snipLim = snippetLimit !== undefined ? Number(snippetLimit) : 30;
    const targetWinStep = Math.max(1, Math.round((durLim * 60) / snipLim));

    let anchors = null;
    if (type === 'NUMERIC' && mode === 'PARTY_CLIMAX') {
      const selected = [];
      const maxNumber = 90;
      while (selected.length < 3) {
        const id = Math.floor(Math.random() * maxNumber) + 1;
        if (!selected.includes(id)) selected.push(id);
      }
      anchors = JSON.stringify(selected);
    }
    
    await db.run(
      'INSERT INTO games (id, status, room_code, playlist, game_type, game_mode, finale_numbers, license_key, target_line, target_two_lines, target_full_house, grid_size, free_space_enabled, time_limit_enabled, duration_limit, snippet_limit, target_winner_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newGameId, 'WAITING', roomCode, playlistJson, type, mode, anchors, license.license_key, targetLineInt, targetTwoLinesInt, targetFullHouseInt, gridSz, freeSp, timeLim, durLim, snipLim, targetWinStep]
    );
    const game = await db.get('SELECT * FROM games WHERE id = ?', [newGameId]);
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get game details
app.get('/api/game', async (req, res) => {
  const db = getDb();
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Game ID required' });
  }

  const game = await db.get('SELECT * FROM games WHERE id = ?', [id]);
  if (!game) return res.status(404).json({ error: 'No game found' });
  
  const lineWinCount = await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ? AND has_line_win >= 1', [game.id]);
  const twoLinesWinCount = await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ? AND has_line_win = 2', [game.id]);
  const calledList = await db.all('SELECT number FROM called_numbers WHERE game_id = ? ORDER BY called_at ASC', [game.id]);
  const joinedCount = await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ?', [game.id]);
  
  res.json({
    ...game,
    lineWinOccurred: lineWinCount.count > 0,
    twoLinesWinOccurred: twoLinesWinCount.count > 0,
    cornersWinOccurred: twoLinesWinCount.count > 0,
    calledNumbers: calledList.map(c => c.number),
    joinedPlayersCount: joinedCount.count
  });
});

// Admin: Start game (and select target winner)
app.post('/api/game/start', async (req, res) => {
  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game) return res.status(404).json({ error: 'No game found' });

  // Choose a random player as the target winner
  const players = await db.all('SELECT id FROM players WHERE game_id = ?', [gameId]);
  let winnerId = null;
  if (players.length > 0) {
    const randPlayer = players[Math.floor(Math.random() * players.length)];
    winnerId = randPlayer.id;
  }

  await db.run('UPDATE games SET status = ?, winner_player_id = ? WHERE id = ?', ['STARTED', winnerId, game.id]);
  io.to(game.id).emit('GAME_STARTED', { gameId: game.id });
  res.json({ success: true, winnerPlayerId: winnerId });
});

// Admin: Reset game (keeps the room active, code same, resets winner target)
app.post('/api/game/reset', async (req, res) => {
  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game) return res.status(404).json({ error: 'No game found' });

  await db.run('DELETE FROM called_numbers WHERE game_id = ?', [gameId]);
  await db.run('DELETE FROM players WHERE game_id = ?', [gameId]);
  
  let anchors = null;
  if (game.game_type === 'NUMERIC' && game.game_mode === 'PARTY_CLIMAX') {
    const selected = [];
    const maxNumber = 90;
    while (selected.length < 3) {
      const id = Math.floor(Math.random() * maxNumber) + 1;
      if (!selected.includes(id)) selected.push(id);
    }
    anchors = JSON.stringify(selected);
  }
  
  await db.run('UPDATE games SET status = ?, winner_player_id = NULL, finale_numbers = ? WHERE id = ?', ['WAITING', anchors, gameId]);
  
  io.to(gameId).emit('GAME_RESET', { gameId });
  res.json({ success: true, id: gameId, roomCode: game.room_code });
});

// Admin: Update redirect & playlist settings
app.post('/api/game/redirect-settings', async (req, res) => {
  const { gameId, redirectUrl, redirectDelay, autoRedirectEnabled, promoImage, promoImageDelay, playlist } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
  if (game) {
    const fields = [
      'redirect_url = ?', 
      'redirect_delay = ?', 
      'auto_redirect_enabled = ?', 
      'promo_image = ?',
      'promo_image_delay = ?'
    ];
    const params = [
      redirectUrl, 
      Number(redirectDelay), 
      autoRedirectEnabled ? 1 : 0, 
      promoImage, 
      Number(promoImageDelay || 0)
    ];

    if (playlist !== undefined) {
      fields.push('playlist = ?');
      params.push(JSON.stringify(playlist));
    }

    params.push(gameId);
    await db.run(
      `UPDATE games SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  }
  res.json({ success: true });
});

// Spotify Credentials
app.post('/api/spotify/credentials', async (req, res) => {
  const { gameId, clientId, clientSecret } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  try {
    const db = getDb();
    await db.run(
      'UPDATE games SET spotify_client_id = ?, spotify_client_secret = ? WHERE id = ?',
      [clientId, clientSecret, gameId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Spotify Login Redirect
app.get('/api/spotify/login', async (req, res) => {
  const { gameId } = req.query;
  if (!gameId) return res.status(400).send('gameId required');
  
  try {
    const db = getDb();
    const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).send('Game not found.');
    
    const clientId = game.spotify_client_id || process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      return res.status(400).send('Please configure Spotify Client ID in server environment variables or game settings.');
    }
    
    let reqHost = req.get('host') || '';
    if (reqHost.includes('localhost')) {
      reqHost = reqHost.replace('localhost', '127.0.0.1');
    }
    const redirectUri = `${req.protocol}://${reqHost}/api/spotify/callback`;
    
    console.log('[Spotify Login] Generated redirect URI:', redirectUri);
    const scopes = 'user-modify-playback-state user-read-playback-state playlist-read-private playlist-read-collaborative';
    
    const spotifyAuthUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${gameId}`;
    res.redirect(spotifyAuthUrl);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Spotify Callback
app.get('/api/spotify/callback', async (req, res) => {
  const { code, state: gameId } = req.query;
  if (!code || !gameId) return res.status(400).send('Missing code or gameId state.');
  
  try {
    const db = getDb();
    const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).send('Game not found.');
    
    const clientId = game.spotify_client_id || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = game.spotify_client_secret || process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).send('Spotify credentials not configured.');
    }
    
    let reqHost = req.get('host') || '';
    if (reqHost.includes('localhost')) {
      reqHost = reqHost.replace('localhost', '127.0.0.1');
    }
    const redirectUri = `${req.protocol}://${reqHost}/api/spotify/callback`;
    console.log('[Spotify Callback] Matching redirect URI:', redirectUri);
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error('Spotify token exchange failed:', errText);
      return res.status(400).send(`Spotify login failed: ${errText}`);
    }
    
    const data = await response.json();
    await db.run(
      'UPDATE games SET spotify_access_token = ?, spotify_refresh_token = ? WHERE id = ?',
      [data.access_token, data.refresh_token, gameId]
    );
    
    const clientOrigin = req.headers.referer || `${req.protocol}://${req.headers.host}`;
    const cleanOrigin = clientOrigin.replace(/\/api\/spotify.*/, '');
    res.redirect(`${cleanOrigin}/admin`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Import Spotify Playlist Tracks
app.post('/api/spotify/import', async (req, res) => {
  const { gameId, playlistUrl } = req.body;
  if (!gameId || !playlistUrl) return res.status(400).json({ error: 'gameId and playlistUrl required' });
  
  const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) return res.status(400).json({ error: 'Invalid Spotify Playlist URL' });
  const playlistId = match[1];
  
  try {
    const db = getDb();
    let game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    
    let token = game.spotify_access_token;
    if (!token) return res.status(401).json({ error: 'Spotify account not connected. Please login first.' });
    
    const fetchTracks = async (bearerToken) => {
      return fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`, {
        headers: { 'Authorization': `Bearer ${bearerToken}` }
      });
    };
    
    let response = await fetchTracks(token);
    if (response.status === 401) {
      token = await refreshSpotifyToken(gameId);
      if (!token) return res.status(401).json({ error: 'Failed to refresh Spotify connection token. Please reconnect.' });
      response = await fetchTracks(token);
    }
    
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Spotify API error: ${errText}` });
    }
    
    const playlistData = await response.json();
    const tracks = playlistData.items || [];
    
    const formattedPlaylist = tracks
      .filter(item => item.track)
      .map(item => {
        const t = item.track;
        const name = t.name;
        const artists = t.artists.map(a => a.name).join(', ');
        return {
          name: `${name} - ${artists}`,
          uri: t.uri
        };
      });
      
    if (formattedPlaylist.length < 9) {
      return res.status(400).json({ error: `Selected playlist only has ${formattedPlaylist.length} tracks. A minimum of 9 tracks is required.` });
    }
    
    await db.run(
      'UPDATE games SET playlist = ?, spotify_playlist_url = ? WHERE id = ?',
      [JSON.stringify(formattedPlaylist), playlistUrl, gameId]
    );
    
    res.json({ success: true, tracksCount: formattedPlaylist.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Spotify Playlists of Connected User
app.get('/api/spotify/playlists', async (req, res) => {
  const { gameId } = req.query;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  try {
    const db = getDb();
    const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    
    let token = game.spotify_access_token;
    if (!token) return res.status(401).json({ error: 'Spotify account not connected.' });
    
    const fetchPlaylists = async (bearerToken) => {
      return fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { 'Authorization': `Bearer ${bearerToken}` }
      });
    };
    
    let response = await fetchPlaylists(token);
    if (response.status === 401) {
      token = await refreshSpotifyToken(gameId);
      if (!token) return res.status(401).json({ error: 'Failed to refresh Spotify token.' });
      response = await fetchPlaylists(token);
    }
    
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Spotify API error: ${errText}` });
    }
    
    const data = await response.json();
    const playlists = (data.items || []).map(p => ({
      id: p.id,
      name: p.name,
      url: p.external_urls.spotify,
      tracksCount: p.tracks.total
    }));
    
    res.json({ success: true, playlists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join game (using roomCode)
app.post('/api/game/join', async (req, res) => {
  const { name, roomCode } = req.body;
  if (!name || !roomCode) {
    return res.status(400).json({ error: 'Name and Room Code are required' });
  }

  const db = getDb();
  const game = await db.get('SELECT * FROM games WHERE room_code = ? ORDER BY created_at DESC LIMIT 1', [roomCode.toUpperCase().trim()]);
  if (!game) return res.status(404).json({ error: 'Game room not found' });
  if (game.status === 'FINISHED') return res.status(400).json({ error: 'This game has already finished' });

  const playerId = uuidv4();
  const playlist = JSON.parse(game.playlist || '[]');
  const playlistSize = playlist.length || 50;
  
  // Generate card depending on game type, mode, grid size and free space
  const gridSz = game.grid_size || 3;
  const freeSp = !!game.free_space_enabled;
  let card;
  if (game.game_type === 'NUMERIC') {
    if (game.game_mode === 'PARTY_CLIMAX') {
      const anchors = JSON.parse(game.finale_numbers || '[]');
      card = generatePartyClimaxCard(90, anchors, gridSz, freeSp);
    } else {
      card = generateMusicalCard(90, gridSz, freeSp);
    }
  } else {
    card = generateMusicalCard(playlistSize, gridSz, freeSp);
  }
  const sessionToken = uuidv4();

  await db.run(
    'INSERT INTO players (id, game_id, name, card_data, session_token) VALUES (?, ?, ?, ?, ?)',
    [playerId, game.id, name, JSON.stringify(card), sessionToken]
  );

  res.json({ playerId, card, sessionToken, gameId: game.id, roomCode: game.room_code });
});

// Spotify sync pollers map
const spotifyPollers = new Map();

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('START_SPOTIFY_SYNC', async (data) => {
    const { gameId } = data;
    if (!gameId) return;

    if (spotifyPollers.has(gameId)) {
      clearInterval(spotifyPollers.get(gameId));
    }

    console.log(`[Spotify Sync] Starting sync process for game: ${gameId}`);
    let lastTitle = '';

    const intervalId = setInterval(async () => {
      try {
        const db = getDb();
        const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
        if (!game || game.status === 'FINISHED' || game.status === 'WAITING') {
          console.log(`[Spotify Sync] Stopping sync for game: ${gameId} (game status is finished or waiting)`);
          clearInterval(intervalId);
          spotifyPollers.delete(gameId);
          io.to(gameId).emit('SPOTIFY_SYNC_STATUS', { enabled: false });
          return;
        }

        exec('powershell -Command "Get-Process spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle} | Select-Object -ExpandProperty MainWindowTitle"', async (err, stdout, stderr) => {
          if (err || !stdout) return;
          const title = stdout.trim();
          if (!title || title === lastTitle) return;
          lastTitle = title;

          const forbiddenTitles = ['spotify', 'spotify free', 'spotify premium', 'advertisement'];
          if (forbiddenTitles.includes(title.toLowerCase()) || title.toLowerCase().startsWith('spotify ')) {
            return;
          }

          console.log(`[Spotify Sync] Detected track playing: "${title}"`);

          const playlist = JSON.parse(game.playlist || '[]');
          const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanTitle = clean(title);

          let matchedIndex = -1;
          for (let i = 0; i < playlist.length; i++) {
            const cleanPlaylistSong = clean(playlist[i]);
            if (cleanTitle.includes(cleanPlaylistSong) || cleanPlaylistSong.includes(cleanTitle)) {
              matchedIndex = i;
              break;
            }
          }

          if (matchedIndex !== -1) {
            const songId = matchedIndex + 1;
            const alreadyCalled = await db.get('SELECT 1 FROM called_numbers WHERE game_id = ? AND number = ?', [gameId, songId]);
            
            if (!alreadyCalled) {
              console.log(`[Spotify Sync] Auto-calling matched song: "${playlist[matchedIndex]}" (ID: ${songId})`);
              await db.run('INSERT INTO called_numbers (game_id, number) VALUES (?, ?)', [gameId, songId]);
              
              const called = await db.all('SELECT number FROM called_numbers WHERE game_id = ? ORDER BY called_at ASC', [gameId]);
              const numbers = called.map(c => c.number);

              io.to(gameId).emit('NUMBER_CALLED', { number: songId, allNumbers: numbers });

              // Check wins!
              const players = await db.all('SELECT * FROM players WHERE game_id = ?', [gameId]);
              const winners = [];

              const lineWinAlreadyOccurred = (await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ? AND has_line_win >= 1', [gameId])).count > 0;
              const twoLinesWinAlreadyOccurred = (await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ? AND has_line_win = 2', [gameId])).count > 0;
              
              let lineWinOccurred = lineWinAlreadyOccurred;
              let gameFinished = false;

              for (const player of players) {
                const card = JSON.parse(player.card_data);
                const winState = checkWin(card, numbers);
                
                if (game.target_full_house === 1 && winState.hasFullHouse && !player.has_full_house) {
                  await db.run('UPDATE players SET has_full_house = 1 WHERE id = ?', [player.id]);
                  winners.push({ id: player.id, name: player.name, type: 'FULL_HOUSE' });
                  gameFinished = true;
                } 
                
                if (game.target_line === 1 && !lineWinAlreadyOccurred && winState.hasLine && !player.has_line_win) {
                  await db.run('UPDATE players SET has_line_win = 1 WHERE id = ?', [player.id]);
                  winners.push({ id: player.id, name: player.name, type: 'LINE' });
                  lineWinOccurred = true;
                } 
                
                if (game.target_two_lines === 1 && !twoLinesWinAlreadyOccurred && (lineWinOccurred || game.target_line !== 1) && winState.hasTwoLines && player.has_line_win !== 2) {
                  await db.run('UPDATE players SET has_line_win = 2 WHERE id = ?', [player.id]);
                  winners.push({ id: player.id, name: player.name, type: 'TWO_LINES' });
                }
              }

              if (winners.length > 0) {
                io.to(gameId).emit('WINNERS_UPDATE', { winners });
              }

              if (gameFinished) {
                await db.run('UPDATE games SET status = ? WHERE id = ?', ['FINISHED', gameId]);
                const updatedGame = await db.get('SELECT redirect_url, redirect_delay, auto_redirect_enabled, promo_image, promo_image_delay FROM games WHERE id = ?', [gameId]);
                io.to(gameId).emit('GAME_FINISHED', { 
                  redirectUrl: updatedGame?.redirect_url,
                  redirectDelay: updatedGame?.redirect_delay,
                  autoRedirectEnabled: updatedGame?.auto_redirect_enabled,
                  promoImage: updatedGame?.promo_image,
                  promoImageDelay: updatedGame?.promo_image_delay
                });
              }
            }
          }
        });
      } catch (err) {
        console.error('[Spotify Sync] Error during poll:', err);
      }
    }, 3000);

    spotifyPollers.set(gameId, intervalId);
    io.to(gameId).emit('SPOTIFY_SYNC_STATUS', { enabled: true });
  });

  socket.on('STOP_SPOTIFY_SYNC', (data) => {
    const { gameId } = data;
    if (!gameId) return;

    if (spotifyPollers.has(gameId)) {
      console.log(`[Spotify Sync] Manual stop requested for game: ${gameId}`);
      clearInterval(spotifyPollers.get(gameId));
      spotifyPollers.delete(gameId);
    }
    io.to(gameId).emit('SPOTIFY_SYNC_STATUS', { enabled: false });
  });

  const broadcastRoomCount = (gameId) => {
    if (!gameId) return;
    const clients = io.sockets.adapter.rooms.get(gameId);
    const count = clients ? clients.size : 0;
    io.to(gameId).emit('ROOM_CONNECTED_COUNT', { count });
  };

  socket.on('JOIN_ROOM', (data) => {
    const { gameId } = data;
    if (gameId) {
      socket.join(gameId);
      console.log(`Socket ${socket.id} joined room: ${gameId}`);
      broadcastRoomCount(gameId);
    }
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        const clients = io.sockets.adapter.rooms.get(room);
        const count = clients ? clients.size - 1 : 0;
        socket.to(room).emit('ROOM_CONNECTED_COUNT', { count });
      }
    }
  });

  // Smart suggestion: only let the designated winner win!
  socket.on('ADMIN_GET_AUTO_NUMBER', async (data) => {
    const { gameId } = data;
    if (!gameId) return;
    const db = getDb();
    const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return;

    const playlist = JSON.parse(game.playlist || '[]');
    const maxRange = game.game_type === 'NUMERIC' ? 90 : (playlist.length || 50);

    const alreadyCalledList = await db.all('SELECT number FROM called_numbers WHERE game_id = ?', [gameId]);
    const alreadyCalled = new Set(alreadyCalledList.map(c => c.number));

    // If Party Climax, exclude all 3 anchors from auto-calling suggestions
    if (game.game_type === 'NUMERIC' && game.game_mode === 'PARTY_CLIMAX') {
      const anchors = JSON.parse(game.finale_numbers || '[]');
      const uncalled = [];
      for (let i = 1; i <= maxRange; i++) {
        if (!alreadyCalled.has(i) && !anchors.includes(i)) {
          uncalled.push(i);
        }
      }
      const suggestion = uncalled.length > 0 ? uncalled[Math.floor(Math.random() * uncalled.length)] : 1;
      socket.emit('AUTO_NUMBER_SUGGESTION', { number: suggestion });
      return;
    }

    const players = await db.all('SELECT * FROM players WHERE game_id = ?', [gameId]);
    if (players.length === 0) {
      const uncalled = [];
      for (let i = 1; i <= maxRange; i++) {
        if (!alreadyCalled.has(i)) uncalled.push(i);
      }
      const suggestion = uncalled.length > 0 ? uncalled[Math.floor(Math.random() * uncalled.length)] : 1;
      socket.emit('AUTO_NUMBER_SUGGESTION', { number: suggestion });
      return;
    }

    let winnerId = game.winner_player_id;
    if (!winnerId) {
      winnerId = players[0].id;
      await db.run('UPDATE games SET winner_player_id = ? WHERE id = ?', [winnerId, gameId]);
    }

    const winnerPlayer = players.find(p => p.id === winnerId) || players[0];

    // Find forbidden song IDs:
    // Any song ID that is the LAST remaining uncalled song on any NON-WINNER player's card!
    const forbidden = new Set();
    players.forEach(p => {
      if (p.id === winnerPlayer.id) return;
      const card = JSON.parse(p.card_data);
      const flatCard = card.flat().filter(num => typeof num === 'number');
      const uncalledOnCard = flatCard.filter(num => !alreadyCalled.has(num));
      if (uncalledOnCard.length === 1) {
        forbidden.add(uncalledOnCard[0]);
      }
    });

    const winnerCard = JSON.parse(winnerPlayer.card_data);
    const winnerFlat = winnerCard.flat();
    const winnerFlatClean = winnerFlat.filter(num => typeof num === 'number');
    const winnerUncalledClean = winnerFlatClean.filter(num => !alreadyCalled.has(num));
    const winnerUncalledSafe = winnerUncalledClean.filter(num => !forbidden.has(num));

    let suggestion;
    const timeLimitEnabled = game.time_limit_enabled === 1;
    const targetWinnerStep = game.target_winner_step || 30;
    const currentStep = alreadyCalled.size + 1;

    if (timeLimitEnabled) {
      const totalWinnerNumbersToCall = winnerFlatClean.length;
      // The locked climax winning number (select the last uncalled number dynamically)
      const winningNumber = winnerUncalledClean[winnerUncalledClean.length - 1];

      if (currentStep >= targetWinnerStep) {
        // Time is up! Suggest the winning number to complete the card.
        if (winningNumber !== undefined) {
          suggestion = winningNumber;
        } else {
          // Fallback if winning number was already called
          const uncalled = [];
          for (let i = 1; i <= maxRange; i++) {
            if (!alreadyCalled.has(i)) uncalled.push(i);
          }
          suggestion = uncalled.length > 0 ? uncalled[Math.floor(Math.random() * uncalled.length)] : 1;
        }
      } else {
        // Calculate how many numbers the winner should have called at this stage
        const targetWinnerCalledCount = Math.min(
          totalWinnerNumbersToCall - 1,
          Math.floor(((totalWinnerNumbersToCall - 1) * currentStep) / (targetWinnerStep - 1))
        );
        const winnerCurrentlyCalled = winnerFlatClean.filter(num => alreadyCalled.has(num)).length;

        if (winnerCurrentlyCalled < targetWinnerCalledCount) {
          // Progress the winner: call an uncalled number that is NOT the locked winningNumber
          const allowedUncalled = winnerUncalledSafe.filter(num => num !== winningNumber);
          if (allowedUncalled.length > 0) {
            suggestion = allowedUncalled[Math.floor(Math.random() * allowedUncalled.length)];
          } else {
            // No safe non-climax numbers left, progress anyway
            const allowedAny = winnerUncalledClean.filter(num => num !== winningNumber);
            if (allowedAny.length > 0) {
              suggestion = allowedAny[Math.floor(Math.random() * allowedAny.length)];
            } else {
              suggestion = winningNumber;
            }
          }
        } else {
          // Call a dummy/filler number (not on the winner's card) to delay the win
          const dummyUncalled = [];
          for (let i = 1; i <= maxRange; i++) {
            if (!alreadyCalled.has(i) && !winnerFlatClean.includes(i) && !forbidden.has(i)) {
              dummyUncalled.push(i);
            }
          }

          if (dummyUncalled.length > 0) {
            suggestion = dummyUncalled[Math.floor(Math.random() * dummyUncalled.length)];
          } else {
            // Fallback: call any safe uncalled number (excluding winningNumber)
            const safeUncalled = [];
            for (let i = 1; i <= maxRange; i++) {
              if (!alreadyCalled.has(i) && !forbidden.has(i) && i !== winningNumber) {
                safeUncalled.push(i);
              }
            }
            if (safeUncalled.length > 0) {
              suggestion = safeUncalled[Math.floor(Math.random() * safeUncalled.length)];
            } else {
              // Complete fallback
              const uncalled = [];
              for (let i = 1; i <= maxRange; i++) {
                if (!alreadyCalled.has(i)) uncalled.push(i);
              }
              suggestion = uncalled.length > 0 ? uncalled[Math.floor(Math.random() * uncalled.length)] : 1;
            }
          }
        }
      }
    } else {
      // Normal smart suggestion logic (no duration limit)
      if (winnerUncalledSafe.length > 0) {
        // 70% chance to progress the target winner, 30% chance to progress others (within safety limits)
        if (Math.random() < 0.7) {
          suggestion = winnerUncalledSafe[Math.floor(Math.random() * winnerUncalledSafe.length)];
        } else {
          const otherUncalled = [];
          players.forEach(p => {
            if (p.id === winnerPlayer.id) return;
            const card = JSON.parse(p.card_data);
            card.flat().filter(num => typeof num === 'number').forEach(num => {
              if (!alreadyCalled.has(num) && !forbidden.has(num) && !winnerFlatClean.includes(num)) {
                otherUncalled.push(num);
              }
            });
          });

          if (otherUncalled.length > 0) {
            suggestion = otherUncalled[Math.floor(Math.random() * otherUncalled.length)];
          } else {
            suggestion = winnerUncalledSafe[Math.floor(Math.random() * winnerUncalledSafe.length)];
          }
        }
      } else {
        // Force winner progress if winner has no other safe moves
        if (winnerUncalledClean.length > 0) {
          suggestion = winnerUncalledClean[Math.floor(Math.random() * winnerUncalledClean.length)];
        } else {
          const uncalled = [];
          for (let i = 1; i <= maxRange; i++) {
            if (!alreadyCalled.has(i)) uncalled.push(i);
          }
          suggestion = uncalled.length > 0 ? uncalled[Math.floor(Math.random() * uncalled.length)] : 1;
        }
      }
    }

    socket.emit('AUTO_NUMBER_SUGGESTION', { number: suggestion });
  });

async function callNumberHelper(gameId, number, io) {
  const db = getDb();
  try {
    const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game) return;

    if (game.game_type === 'MUSIC') {
      const playlist = JSON.parse(game.playlist || '[]');
      const songItem = playlist[number - 1];
      if (songItem && typeof songItem === 'object' && songItem.uri) {
        playSpotifyTrack(gameId, songItem.uri).catch(err => console.error('[Spotify AutoPlay] Error:', err));
      }
    }

    await db.run('INSERT INTO called_numbers (game_id, number) VALUES (?, ?)', [gameId, number]);
    
    const called = await db.all('SELECT number FROM called_numbers WHERE game_id = ? ORDER BY called_at ASC', [gameId]);
    const numbers = called.map(c => c.number);

    io.to(gameId).emit('NUMBER_CALLED', { number, allNumbers: numbers });

    const players = await db.all('SELECT * FROM players WHERE game_id = ?', [gameId]);
    const winners = [];

    const lineWinAlreadyOccurred = (await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ? AND has_line_win >= 1', [gameId])).count > 0;
    const twoLinesWinAlreadyOccurred = (await db.get('SELECT COUNT(*) as count FROM players WHERE game_id = ? AND has_line_win = 2', [gameId])).count > 0;
    
    let lineWinOccurred = lineWinAlreadyOccurred;
    let gameFinished = false;

    for (const player of players) {
      const card = JSON.parse(player.card_data);
      const winState = checkWin(card, numbers);
      
      if (game.target_full_house === 1 && winState.hasFullHouse && !player.has_full_house) {
        await db.run('UPDATE players SET has_full_house = 1 WHERE id = ?', [player.id]);
        winners.push({ id: player.id, name: player.name, type: 'FULL_HOUSE' });
        gameFinished = true;
      } 
      
      if (game.target_line === 1 && !lineWinAlreadyOccurred && winState.hasLine && !player.has_line_win) {
        await db.run('UPDATE players SET has_line_win = 1 WHERE id = ?', [player.id]);
        winners.push({ id: player.id, name: player.name, type: 'LINE' });
        lineWinOccurred = true;
      } 
      
      if (game.target_two_lines === 1 && !twoLinesWinAlreadyOccurred && (lineWinOccurred || game.target_line !== 1) && winState.hasTwoLines && player.has_line_win !== 2) {
        await db.run('UPDATE players SET has_line_win = 2 WHERE id = ?', [player.id]);
        winners.push({ id: player.id, name: player.name, type: 'TWO_LINES' });
      }
    }

    if (winners.length > 0) {
      io.to(gameId).emit('WINNERS_UPDATE', { winners });
    }

    if (gameFinished) {
      await db.run('UPDATE games SET status = ? WHERE id = ?', ['FINISHED', gameId]);
      const updatedGame = await db.get('SELECT redirect_url, redirect_delay, auto_redirect_enabled, promo_image, promo_image_delay FROM games WHERE id = ?', [gameId]);
      io.to(gameId).emit('GAME_FINISHED', { 
        redirectUrl: updatedGame?.redirect_url,
        redirectDelay: updatedGame?.redirect_delay,
        autoRedirectEnabled: updatedGame?.auto_redirect_enabled,
        promoImage: updatedGame?.promo_image,
        promoImageDelay: updatedGame?.promo_image_delay
      });
    }

  } catch (e) {
    console.error("Error calling number helper:", e);
  }
}

  socket.on('ADMIN_CALL_NUMBER', async (data) => {
    const { gameId, number } = data;
    if (!gameId) return;
    await callNumberHelper(gameId, number, io);
  });

  socket.on('ADMIN_TRIGGER_CLIMAX', async (data) => {
    const { gameId } = data;
    if (!gameId) return;
    const db = getDb();
    const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
    if (!game || game.game_mode !== 'PARTY_CLIMAX') return;

    const anchors = JSON.parse(game.finale_numbers || '[]');
    const calledList = await db.all('SELECT number FROM called_numbers WHERE game_id = ?', [gameId]);
    const calledSet = new Set(calledList.map(c => c.number));

    const nextAnchor = anchors.find(a => !calledSet.has(a));
    if (nextAnchor) {
      await callNumberHelper(gameId, nextAnchor, io);
    }
  });

  socket.on('ADMIN_FORCE_REDIRECT', async (data) => {
    const { gameId } = data;
    if (!gameId) return;
    try {
      const db = getDb();
      const game = await db.get('SELECT * FROM games WHERE id = ?', [gameId]);
      if (game && game.redirect_url) {
        console.log('Force redirecting all players in room', gameId, 'to:', game.redirect_url);
        io.to(gameId).emit('FORCE_REDIRECT', { redirectUrl: game.redirect_url });
      }
    } catch (e) {
      console.error('Error force redirecting:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// License verification
app.post('/api/license/verify', async (req, res) => {
  const { licenseKey, deviceId } = req.body;
  if (!licenseKey || !deviceId) {
    return res.status(400).json({ error: 'licenseKey and deviceId are required' });
  }

  try {
    const db = getDb();
    const license = await db.get('SELECT * FROM licenses WHERE license_key = ?', [licenseKey.trim()]);
    
    if (!license) {
      return res.json({ success: false, error: 'INVALID_KEY', message: 'Invalid license key. Please check spelling.' });
    }

    if (license.status !== 'ACTIVE') {
      return res.json({ success: false, error: 'SUSPENDED', message: 'This license has been suspended.' });
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.json({ success: false, error: 'EXPIRED', message: 'This license subscription has expired.' });
    }

    // Check device binding
    if (license.device_id_1 === deviceId || license.device_id_2 === deviceId) {
      return res.json({ success: true, venueName: license.venue_name, expiresAt: license.expires_at });
    }

    // Auto-register primary device if empty
    if (!license.device_id_1) {
      await db.run('UPDATE licenses SET device_id_1 = ? WHERE license_key = ?', [deviceId, license.license_key]);
      return res.json({ success: true, venueName: license.venue_name, expiresAt: license.expires_at });
    }

    // Auto-register backup device if empty
    if (!license.device_id_2) {
      await db.run('UPDATE licenses SET device_id_2 = ? WHERE license_key = ?', [deviceId, license.license_key]);
      return res.json({ success: true, venueName: license.venue_name, expiresAt: license.expires_at });
    }

    // Both device slots filled and current device doesn't match
    return res.json({ 
      success: false, 
      error: 'DEVICE_LOCKED', 
      message: 'This license is locked to other laptops. You must reset/transfer it.',
      deviceLastReset: license.device_last_reset 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Self-service device transfer / reset
app.post('/api/license/transfer', async (req, res) => {
  const { licenseKey, deviceId } = req.body;
  if (!licenseKey || !deviceId) {
    return res.status(400).json({ error: 'licenseKey and deviceId are required' });
  }

  try {
    const db = getDb();
    const license = await db.get('SELECT * FROM licenses WHERE license_key = ?', [licenseKey.trim()]);

    if (!license) {
      return res.json({ success: false, error: 'INVALID_KEY', message: 'Invalid license key.' });
    }

    // Verify cooldown (30 days)
    if (license.device_last_reset) {
      const lastReset = new Date(license.device_last_reset).getTime();
      const diff = Date.now() - lastReset;
      const cooldownMs = 30 * 24 * 60 * 60 * 1000;
      if (diff < cooldownMs) {
        const remainingDays = Math.ceil((cooldownMs - diff) / (24 * 60 * 60 * 1000));
        return res.json({ 
          success: false, 
          error: 'COOLDOWN', 
          message: `Device transfer limit reached. You can transfer again in ${remainingDays} days.` 
        });
      }
    }

    // Set device_id_1 as the new device, clear device_id_2, and update last reset timestamp
    await db.run(
      'UPDATE licenses SET device_id_1 = ?, device_id_2 = NULL, device_last_reset = datetime(\'now\') WHERE license_key = ?', 
      [deviceId, license.license_key]
    );

    res.json({ success: true, venueName: license.venue_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only endpoints to generate licenses and clear device locks
app.post('/api/admin/licenses/create', async (req, res) => {
  const { venueName, expiresDays } = req.body;
  if (!venueName) {
    return res.status(400).json({ error: 'venueName is required' });
  }

  try {
    const db = getDb();
    // Generate key format: MB-XXXXX-XXXXX
    const keyPart1 = uuidv4().slice(0, 5).toUpperCase();
    const keyPart2 = uuidv4().slice(9, 14).toUpperCase();
    const licenseKey = `MB-${keyPart1}-${keyPart2}`;
    
    let expiresAt = null;
    if (expiresDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(expiresDays));
      expiresAt = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
    }

    await db.run(
      'INSERT INTO licenses (license_key, venue_name, expires_at) VALUES (?, ?, ?)',
      [licenseKey, venueName, expiresAt]
    );

    res.json({ success: true, licenseKey, venueName, expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/licenses/reset', async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) {
    return res.status(400).json({ error: 'licenseKey required' });
  }

  try {
    const db = getDb();
    await db.run(
      'UPDATE licenses SET device_id_1 = NULL, device_id_2 = NULL, device_last_reset = NULL WHERE license_key = ?',
      [licenseKey.trim()]
    );
    res.json({ success: true, message: `License ${licenseKey} has been reset successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*all', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

async function start() {
  await initDb();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
