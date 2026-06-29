
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let db;

async function initDb() {
  db = await open({
    filename: process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'WAITING', -- WAITING, STARTED, FINALE, FINISHED
      game_mode TEXT DEFAULT 'SINGLE_WINNER', -- SINGLE_WINNER, PARTY_CLIMAX
      finale_numbers TEXT, -- JSON array
      redirect_url TEXT,
      redirect_delay INTEGER DEFAULT 30,
      auto_redirect_enabled INTEGER DEFAULT 1,
      room_code TEXT,
      company_name TEXT DEFAULT 'Musical Bingo',
      logo_url TEXT DEFAULT '',
      primary_color TEXT DEFAULT '#ec4899',
      secondary_color TEXT DEFAULT '#6366f1',
      background_color TEXT DEFAULT '#0d0526',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      card_data TEXT, -- JSON array
      session_token TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      has_line_win BOOLEAN DEFAULT 0,
      has_full_house BOOLEAN DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS called_numbers (
      game_id TEXT,
      number INTEGER,
      called_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (game_id, number),
      FOREIGN KEY (game_id) REFERENCES games(id)
    );
  `);

  // Safe migration to add columns if database exists from before
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN redirect_url TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN redirect_delay INTEGER DEFAULT 30;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN auto_redirect_enabled INTEGER DEFAULT 1;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN room_code TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN company_name TEXT DEFAULT 'Musical Bingo';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN logo_url TEXT DEFAULT '';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN primary_color TEXT DEFAULT '#ec4899';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN secondary_color TEXT DEFAULT '#6366f1';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN background_color TEXT DEFAULT '#0d0526';`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN promo_image TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN promo_image_delay INTEGER DEFAULT 0;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE players ADD COLUMN name TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN playlist TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN winner_player_id TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN spotify_client_id TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN spotify_client_secret TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN spotify_access_token TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN spotify_refresh_token TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN spotify_playlist_url TEXT;`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE games ADD COLUMN game_mode TEXT DEFAULT 'SINGLE_WINNER';`);
  } catch (e) {}




  return db;
}


function getDb() {
  return db;
}

module.exports = { initDb, getDb };


