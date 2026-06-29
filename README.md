
# Controlled Bingo Web App

A web-based bingo game with a "controlled finale" where everyone wins at the same time.

## Features
- **Unique Bingo Cards**: Every player gets a unique 3x3 card.
- **Early Wins**: Players can win lines or corners genuinely before the finale.
- **Controlled Finale**: The host can trigger a finale sequence that makes all active players win simultaneously.
- **Real-time Sync**: Uses Socket.IO for instant number updates and win notifications.
- **Mobile Friendly**: Designed for mobile use.

## Quick Start (Windows)
Double-click `run-bingo.bat` in the root folder. This will:
1. Start the server.
2. Start the client.
3. Open both the Player and Admin pages in your browser.

## Manual Setup

### Prerequisites
- Node.js installed

### Installation

1. **Server**
   ```bash
   cd server
   npm install
   node index.js
   ```

2. **Client**
   ```bash
   cd client
   npm install
   npm run dev
   ```

## How to Play
1. Players navigate to the root URL to join.
2. The host navigates to `/admin` to control the game.
3. The host starts the game and calls numbers.
4. When ready, the host clicks "TRIGGER FINALE" to complete the game.

## Tech Stack
- **Frontend**: React, TypeScript, Vite, Vanilla CSS
- **Backend**: Node.js, Express, Socket.IO, SQLite
- **Real-time**: Socket.IO
