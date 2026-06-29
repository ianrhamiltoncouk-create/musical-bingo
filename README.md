# Musical Bingo Web App

A web-based musical bingo game where card numbers are replaced with song tracks, featuring an integrated audio player, Spotify auto-playback, and a smart single-winner guarantee system.

## Key Features
- **Smart Single-Winner Guarantee**: Ensures that exactly one designated player wins the Full House, building maximum group suspense.
- **Spotify Autoplay Integration**: Connect your Spotify Developer App credentials and play songs from a Spotify playlist URL. The app automatically controls your Spotify player in the background (PC or phone) and registers calls in real-time.
- **Local Audio Track Player**: Select a folder of local `.mp3` or `.wav` files to play music directly through your PC browser while automatically broadcasting track calls to players.
- **Linear Game Progression**: Smooth transitions from Stage 1 (Line Win) to Stage 2 (Two Lines Win) to Stage 3 (Full House).
- **Responsive Web & Mobile Support**: Fully mobile-friendly client cards and host dashboards.
- **Custom Branding & Redirects**: Upload logos, custom primary/secondary colors, background themes, custom end-of-game promo images, and auto-redirect links.

## Quick Start (Windows)
Double-click `run-bingo.bat` in the root folder. This will:
1. Build the latest client code.
2. Launch the minimized Node.js SQLite server.
3. Automatically open both the Player and Admin pages in your browser.

## Manual Setup

### Prerequisites
- Node.js (v18+)

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
   npm run build
   ```

## How to Play
1. Players join the game room code.
2. The host navigates to `/admin` to control the game.
3. Paste/import your playlist of songs (or connect Spotify/drag audio files).
4. The host starts the game and plays/calls tracks.
5. The game notifies players of line and house wins in real-time with confetti!
