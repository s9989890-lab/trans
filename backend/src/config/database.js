const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Locate backend root directory
const backendDir = path.resolve(__dirname, '..', '..');

// Load environment variables from backend/.env if not already loaded
dotenv.config({ path: path.join(backendDir, '.env') });

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// On Vercel / serverless environments, the filesystem outside /tmp is read-only
let dbFullPath;
if (isVercel) {
  dbFullPath = path.join('/tmp', 'expense-tracker.db');
} else {
  const dbRelativePath = process.env.DATABASE_PATH || 'database/expense-tracker.db';
  dbFullPath = path.isAbsolute(dbRelativePath)
    ? dbRelativePath
    : path.resolve(backendDir, dbRelativePath);
}

// Ensure the target directory for the SQLite database exists
const dbDir = path.dirname(dbFullPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// If on Vercel and a bundled database exists in the project, copy it to /tmp if not yet present
if (isVercel) {
  const bundledDbPath = path.resolve(backendDir, 'database', 'expense-tracker.db');
  if (!fs.existsSync(dbFullPath) && fs.existsSync(bundledDbPath)) {
    try {
      fs.copyFileSync(bundledDbPath, dbFullPath);
    } catch (e) {
      console.warn('Could not copy bundled DB to /tmp, will initialize fresh:', e.message);
    }
  }
}

// Connect to SQLite database
const db = new Database(dbFullPath);

try {
  db.pragma('journal_mode = WAL');
} catch {
  // In serverless /tmp environments where WAL shared-memory isn't supported, fallback to DELETE
  db.pragma('journal_mode = DELETE');
}
db.pragma('foreign_keys = ON');

// Schema definition with embedded fallback for serverless bundling
const DEFAULT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  date TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, month)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
`;

const schemaPath = path.join(backendDir, 'database', 'schema.sql');
let schemaSql = DEFAULT_SCHEMA_SQL;
if (fs.existsSync(schemaPath)) {
  try {
    schemaSql = fs.readFileSync(schemaPath, 'utf8');
  } catch {
    schemaSql = DEFAULT_SCHEMA_SQL;
  }
}

db.exec(schemaSql);

module.exports = db;
