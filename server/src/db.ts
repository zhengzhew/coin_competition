import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { formalMetrics, leaderboardScore } from './scoring.js';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  const dataDir = resolve(process.env.COIN_DATA_DIR || resolve(process.cwd(), 'data'));
  mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(resolve(dataDir, 'coin-competition.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  // Calculate current-rule scores on read; keep stored historical results intact.
  db.function('teacher_score', { deterministic: true }, (configuration, status, steps, mode, source, activeSeconds, startedAt, finalizedAt) => {
    if (status !== 'success') return null;
    const rule = configuration === null ? null : JSON.parse(String(configuration)).rule;
    const metrics = formalMetrics({ steps, mode, program_snapshot: source, active_seconds: activeSeconds, started_at: startedAt, finalized_at: finalizedAt });
    return leaderboardScore(rule, metrics.steps, metrics.code_lines, metrics.seconds);
  });
  const columns = db.prepare('PRAGMA table_info(attempts)').all().map(column => column.name === 'score'
    ? `teacher_score((SELECT value FROM leaderboard_config WHERE id = 1), a.status, a.steps, a.mode, a.program_snapshot, a.active_seconds, a.started_at, a.finalized_at) AS score`
    : `a."${String(column.name).replaceAll('"', '""')}"`);
  db.exec(`CREATE TEMP VIEW scored_attempts AS SELECT ${columns.join(', ')} FROM main.attempts a`);
  return db;
}

function initSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS players (
      player_uuid TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      language_experience TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      assignment_key TEXT NOT NULL,
      level_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      player_uuid TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (assignment_key, player_uuid),
      FOREIGN KEY (player_uuid) REFERENCES players(player_uuid)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      attempt_id TEXT PRIMARY KEY,
      assignment_key TEXT NOT NULL,
      player_uuid TEXT NOT NULL,
      mode TEXT NOT NULL,
      trial_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      steps INTEGER NOT NULL DEFAULT 0,
      collisions INTEGER NOT NULL DEFAULT 0,
      collected_count INTEGER NOT NULL DEFAULT 0,
      collected_order TEXT NOT NULL DEFAULT '[]',
      score REAL,
      commands TEXT NOT NULL DEFAULT '[]',
      program_snapshot TEXT,
      started_at TEXT NOT NULL,
      finalized_at TEXT,
      FOREIGN KEY (player_uuid) REFERENCES players(player_uuid)
    );

    CREATE TABLE IF NOT EXISTS event_streams (
      stream_id TEXT PRIMARY KEY,
      player_uuid TEXT NOT NULL,
      scope TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (player_uuid) REFERENCES players(player_uuid)
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      player_uuid TEXT NOT NULL,
      assignment_key TEXT,
      level_id TEXT,
      mode TEXT,
      attempt_id TEXT,
      event_type TEXT NOT NULL,
      element_id TEXT,
      interaction_id TEXT,
      client_time TEXT NOT NULL,
      page_instance_id TEXT NOT NULL,
      mono_ms REAL NOT NULL,
      elapsed_ms REAL NOT NULL,
      payload TEXT NOT NULL,
      event_json TEXT NOT NULL,
      server_received_at TEXT NOT NULL,
      FOREIGN KEY (stream_id) REFERENCES event_streams(stream_id),
      UNIQUE(stream_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_player_assignment
      ON attempts(player_uuid, assignment_key, trial_index);
    CREATE INDEX IF NOT EXISTS idx_events_player_time
      ON events(player_uuid, server_received_at);
    CREATE INDEX IF NOT EXISTS idx_events_attempt
      ON events(attempt_id, seq);
  `);
  const columns = database.prepare('PRAGMA table_info(attempts)').all();
  if (!columns.some(column => column.name === 'active_seconds')) database.exec('ALTER TABLE attempts ADD COLUMN active_seconds REAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_config (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leaderboard_submissions (
      submission_id TEXT PRIMARY KEY, player_uuid TEXT NOT NULL REFERENCES players(player_uuid), participant_id TEXT NOT NULL,
      display_name TEXT NOT NULL, competition TEXT NOT NULL, level_id TEXT NOT NULL, mode TEXT NOT NULL, content_version TEXT NOT NULL,
      steps REAL NOT NULL, code_lines INTEGER NOT NULL, seconds REAL NOT NULL, completed INTEGER NOT NULL, submitted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_scope ON leaderboard_submissions(competition, level_id, mode, submitted_at);
  `);
}

export function closeDb() {
  db?.close();
  db = null;
}
