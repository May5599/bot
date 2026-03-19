"use strict";

const Database = require("better-sqlite3");
const path = require("path");
const dummyData = require("./dummyData");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "properties.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create table on first run
db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    code         TEXT PRIMARY KEY,
    title        TEXT NOT NULL DEFAULT '',
    location     TEXT NOT NULL DEFAULT '',
    rent         TEXT NOT NULL DEFAULT '',
    availability TEXT NOT NULL DEFAULT '',
    bedrooms     REAL NOT NULL DEFAULT 0,
    bathrooms    REAL NOT NULL DEFAULT 0,
    parking      TEXT NOT NULL DEFAULT '',
    restrictions TEXT NOT NULL DEFAULT '',
    link         TEXT NOT NULL DEFAULT ''
  )
`);

// Seed with dummyData entries only if the table is empty
function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) as n FROM properties").get().n;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO properties
        (code, title, location, rent, availability,
         bedrooms, bathrooms, parking, restrictions, link)
      VALUES
        (@code, @title, @location, @rent, @availability,
         @bedrooms, @bathrooms, @parking, @restrictions, @link)
    `);
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(row);
    });
    insertMany(dummyData);
    console.log(`DB seeded with ${dummyData.length} properties from dummyData.js`);
  }
}

seedIfEmpty();

// ─── Query functions ──────────────────────────────────────────────────────────

function getAllProperties() {
  return db.prepare("SELECT * FROM properties ORDER BY code ASC").all();
}

function getPropertyByCode(code) {
  return db.prepare("SELECT * FROM properties WHERE code = ?").get(code) || null;
}

function insertProperty(property) {
  return db.prepare(`
    INSERT OR REPLACE INTO properties
      (code, title, location, rent, availability,
       bedrooms, bathrooms, parking, restrictions, link)
    VALUES
      (@code, @title, @location, @rent, @availability,
       @bedrooms, @bathrooms, @parking, @restrictions, @link)
  `).run(property);
}

function deleteProperty(code) {
  return db.prepare("DELETE FROM properties WHERE code = ?").run(code);
}

module.exports = { getAllProperties, getPropertyByCode, insertProperty, deleteProperty };
