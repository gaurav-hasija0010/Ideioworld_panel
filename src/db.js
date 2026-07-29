'use strict';

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

// Make sure the data directory exists before opening the DB file.
fs.mkdirSync(config.paths.data, { recursive: true });
fs.mkdirSync(config.paths.uploads, { recursive: true });

// Uses Node's built-in SQLite (node:sqlite) — no native dependency to install.
const db = new DatabaseSync(config.paths.db);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Single shared table for both Business and Mobile Hut records.
// `type` distinguishes them: 'business' | 'mobile_hut'.
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL DEFAULT 'business',
    business_name TEXT NOT NULL,
    owner_name    TEXT,
    contact_no    TEXT,
    email         TEXT,
    location      TEXT,
    category      TEXT,
    business_type TEXT,
    gst_no        TEXT,
    timings       TEXT,
    menu_services TEXT,
    deal          TEXT,
    status        TEXT DEFAULT 'New Lead',
    notes         TEXT,
    description   TEXT,
    start_date    TEXT,               -- Mobile Hut: start date
    closed_days   TEXT,               -- Mobile Hut: weekly off / closed days
    mobility      TEXT,               -- Mobile Hut: Permanent | Moves around
    logo          TEXT,               -- stored filename
    owner_photo   TEXT,               -- stored filename (Mobile Hut owner)
    document      TEXT,               -- stored filename
    images        TEXT DEFAULT '[]',  -- JSON array of filenames
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_type   ON records(type);
  CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
`);

// Lightweight migration: add any columns missing from an older database.
const existingCols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name);
const ensureCol = (name, decl) => {
  if (!existingCols.includes(name)) db.exec(`ALTER TABLE records ADD COLUMN ${name} ${decl}`);
};
ensureCol('description', 'TEXT');
ensureCol('start_date', 'TEXT');
ensureCol('closed_days', 'TEXT');
ensureCol('mobility', 'TEXT');
ensureCol('owner_photo', 'TEXT');

module.exports = db;
