const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Locate backend root directory
const backendDir = path.resolve(__dirname, '..', '..');

// Load environment variables from backend/.env if not already loaded
dotenv.config({ path: path.join(backendDir, '.env') });

const dbRelativePath = process.env.DATABASE_PATH || 'database/expense-tracker.db';
const dbFullPath = path.isAbsolute(dbRelativePath)
  ? dbRelativePath
  : path.resolve(backendDir, dbRelativePath);

// Ensure the target directory for the SQLite database exists
const dbDir = path.dirname(dbFullPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to SQLite database
const db = new Database(dbFullPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema if not exists
const schemaPath = path.join(backendDir, 'database', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

module.exports = db;
