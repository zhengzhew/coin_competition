import { Router, type CookieOptions, type NextFunction, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  calculateScore,
  replay,
  solve,
  type Direction,
  type GameState,
  type LevelDef,
  type ReplayResult,
  type TelemetryEvent,
} from '@coin-path/shared';
import { getDb } from './db.js';
import { getLevelForAssignment, loadLevels } from './levels.js';

export const apiRouter = Router();
const VALID_DIRECTIONS = new Set<Direction>(['up', 'down', 'left', 'right']);
const TERMINAL = new Set(['success', 'command_limit']);

function now() {
  return new Date().toISOString();
}

function playerCookieOptions(): CookieOptions {
  const publicOrigin = process.env.PUBLIC_ORIGIN || '';
  let secure = false;
  try {
    secure = new URL(publicOrigin).protocol === 'https:';
  } catch {
    secure = false;
  }
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 1000 * 60 * 60 * 24 * 180,
  };
}

function studentLevel(level: LevelDef) {
  const { expected_optimal_steps: _answer, expected_max_value: _valueAnswer, ...safe } = level;
  return safe;
}

function randomPlayer() {
  const adjectives = ['勇敢', '机智', '灵活', '闪亮', '沉着', '幸运'];
  const nouns = ['淘金者', '探险家', '寻宝人', '领航员'];
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]} ${suffix}`;
}

function playerId(req: Request): string | null {
  return typeof req.cookies?.player_uuid === 'string' ? req.cookies.player_uuid : null;
}

function requirePlayer(req: Request, res: Response, next: NextFunction) {
  const id = playerId(req);
  if (!id) return res.status(401).json({ error: '玩家身份尚未建立' });
  const found = getDb().prepare('SELECT 1 FROM players WHERE player_uuid = ?').get(id);
  if (!found) return res.status(401).json({ error: '玩家身份无效' });
  next();
}

function teacherGuard(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.TEACHER_KEY || (process.env.NODE_ENV === 'production' ? '' : 'demo-teacher-key');
  if (!configured) return res.status(503).json({ error: '服务端尚未设置 TEACHER_KEY' });
  if (req.header('x-teacher-key') !== configured) return res.status(401).json({ error: '教师密钥错误' });
  next();
}

function scoreReplay(level: LevelDef, result: ReplayResult) {
  const optimal = level.expected_optimal_steps ?? solve(level, level.required_order)?.length ?? result.steps;
  const coinValues = Object.fromEntries(level.coins.map((coin) => [coin.id, coin.value ?? 1]));
  const state: GameState = {
    x: result.end[0], y: result.end[1], width: level.width, height: level.height,
    walls: new Set(), coins: new Map(), collected: result.collected_order,
    collected_mask: 0, steps: result.steps, collisions: result.collisions,
    consumed_commands: result.consumed_commands, status: result.status, trace: result.trace,
  };
  return calculateScore(state, level.coins.length, optimal, coinValues, level.expected_max_value);
}

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', levels: loadLevels().length, time: now() });
});

apiRouter.get('/levels', (_req, res) => {
  res.json(loadLevels().map(studentLevel));
});

apiRouter.get('/levels/:id', (req, res) => {
  const level = loadLevels().find((item) => item.level_id === String(req.params.id).toUpperCase());
  if (!level) return res.status(404).json({ error: '关卡不存在' });
  res.json(studentLevel(level));
});

apiRouter.post('/players/bootstrap', (req, res) => {
  const database = getDb();
  const existing = playerId(req);
  if (existing) {
    const player = database.prepare('SELECT * FROM players WHERE player_uuid = ?').get(existing);
    if (player) return res.json({ ...player, resumed: true });
  }

  const id = uuidv4();
  const timestamp = now();
  database.prepare(`
    INSERT INTO players (player_uuid, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, randomPlayer(), timestamp, timestamp);
  const player = database.prepare('SELECT * FROM players WHERE player_uuid = ?').get(id) as Record<string, unknown>;
  res.cookie('player_uuid', id, playerCookieOptions());
  res.status(201).json({ ...player, resumed: false });
});

apiRouter.patch('/players/profile', requirePlayer, (req, res) => {
  const id = playerId(req)!;
  const experience = req.body?.language_experience;
  const allowed = new Set(['python', 'cpp', 'both', 'none']);
  if (!allowed.has(experience)) return res.status(422).json({ error: '请选择有效的编程学习经历' });
  getDb().prepare(`
    UPDATE players SET language_experience = ?, updated_at = ? WHERE player_uuid = ?
  `).run(experience, now(), id);
  res.json(getDb().prepare('SELECT * FROM players WHERE player_uuid = ?').get(id));
});

apiRouter.post('/players/switch', requirePlayer, (_req, res) => {
  const database = getDb();
  const id = uuidv4();
  const timestamp = now();
  database.prepare(`
    INSERT INTO players (player_uuid, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, randomPlayer(), timestamp, timestamp);
  res.cookie('player_uuid', id, playerCookieOptions());
  res.status(201).json(database.prepare('SELECT * FROM players WHERE player_uuid = ?').get(id));
});

apiRouter.get('/assignments/:id', requirePlayer, (req, res) => {
  const key = String(req.params.id).toUpperCase();
  const level = getLevelForAssignment(key);
  if (!level) return res.status(404).json({ error: '任务不存在' });
  const id = playerId(req)!;
  const attempts = getDb().prepare(`
    SELECT attempt_id, trial_index, status, steps, collisions, collected_count, score, started_at, finalized_at
    FROM attempts WHERE assignment_key = ? AND player_uuid = ? ORDER BY trial_index
  `).all(key, id);
  const limit = level.max_attempts ?? (level.stage === 'challenge' ? 3 : null);
  res.json({
    assignment_key: key,
    mode: key.startsWith('K') ? 'keyboard' : 'python_blank',
    level: studentLevel(level),
    attempts,
    remaining_attempts: limit === null ? null : Math.max(0, limit - attempts.length),
  });
});

apiRouter.post('/attempts', requirePlayer, (req, res) => {
  const database = getDb();
  const key = String(req.body?.assignment_key || '').toUpperCase();
  const level = getLevelForAssignment(key);
  if (!level) return res.status(404).json({ error: '任务不存在' });
  const id = playerId(req)!;
  const mode = key.startsWith('K') ? 'keyboard' : 'python_blank';
  const count = database.prepare(`
    SELECT COUNT(*) AS count FROM attempts WHERE assignment_key = ? AND player_uuid = ?
  `).get(key, id) as { count: number };
  const limit = level.max_attempts ?? (level.stage === 'challenge' ? 3 : null);
  if (limit !== null && count.count >= limit) return res.status(409).json({ error: `本关最多尝试 ${limit} 次` });

  const timestamp = now();
  database.prepare(`
    INSERT OR IGNORE INTO assignments (assignment_key, level_id, mode, player_uuid, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, level.level_id, mode, id, timestamp);
  database.prepare(`
    UPDATE attempts SET status = 'abandoned', finalized_at = ?
    WHERE assignment_key = ? AND player_uuid = ? AND status = 'running'
  `).run(timestamp, key, id);
  const attemptId = uuidv4();
  database.prepare(`
    INSERT INTO attempts (attempt_id, assignment_key, player_uuid, mode, trial_index, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(attemptId, key, id, mode, count.count + 1, timestamp);
  res.status(201).json({ attempt_id: attemptId, assignment_key: key, mode, trial_index: count.count + 1 });
});

apiRouter.post('/attempts/:id/commands', requirePlayer, (req, res) => {
  const database = getDb();
  const id = playerId(req)!;
  const attempt = database.prepare(`SELECT * FROM attempts WHERE attempt_id = ? AND player_uuid = ?`)
    .get(String(req.params.id), id) as Record<string, unknown> | undefined;
  if (!attempt) return res.status(404).json({ error: '轮次不存在' });
  if (attempt.status !== 'running') return res.status(409).json({ error: '轮次已经结束' });
  const incoming = req.body?.commands;
  if (!Array.isArray(incoming) || incoming.some((item) => !VALID_DIRECTIONS.has(item))) {
    return res.status(422).json({ error: 'commands 只能包含 up/down/left/right' });
  }

  const level = getLevelForAssignment(String(attempt.assignment_key));
  if (!level) return res.status(500).json({ error: '关卡数据缺失' });
  const previous = JSON.parse(String(attempt.commands || '[]')) as Direction[];
  const commands = [...previous, ...incoming as Direction[]].slice(0, level.max_commands);
  const result = replay(level, commands, level.required_order);
  const score = scoreReplay(level, result);
  const isTerminal = TERMINAL.has(result.status);
  database.prepare(`
    UPDATE attempts SET commands = ?, program_snapshot = COALESCE(?, program_snapshot),
      status = ?, steps = ?, collisions = ?, collected_count = ?, collected_order = ?, score = ?,
      finalized_at = CASE WHEN ? = 1 THEN ? ELSE finalized_at END
    WHERE attempt_id = ?
  `).run(
    JSON.stringify(commands), req.body?.program_snapshot || null,
    isTerminal ? result.status : 'running', result.steps, result.collisions,
    result.collected_order.length, JSON.stringify(result.collected_order), score.total_score,
    isTerminal ? 1 : 0, now(), String(req.params.id),
  );
  res.json({ ...result, score, is_terminal: isTerminal });
});

apiRouter.post('/attempts/:id/finalize', requirePlayer, (req, res) => {
  const database = getDb();
  const id = playerId(req)!;
  const attempt = database.prepare(`SELECT * FROM attempts WHERE attempt_id = ? AND player_uuid = ?`)
    .get(String(req.params.id), id) as Record<string, unknown> | undefined;
  if (!attempt) return res.status(404).json({ error: '轮次不存在' });
  const level = getLevelForAssignment(String(attempt.assignment_key));
  if (!level) return res.status(500).json({ error: '关卡数据缺失' });
  const commands = JSON.parse(String(attempt.commands || '[]')) as Direction[];
  const replayed = replay(level, commands, level.required_order);
  const result = level.step_limit && replayed.status === 'incomplete'
    ? { ...replayed, status: 'success' as const }
    : replayed;
  const score = scoreReplay(level, result);
  database.prepare(`
    UPDATE attempts SET status = ?, steps = ?, collisions = ?, collected_count = ?,
      collected_order = ?, score = ?, finalized_at = ? WHERE attempt_id = ?
  `).run(result.status, result.steps, result.collisions, result.collected_order.length,
    JSON.stringify(result.collected_order), score.total_score, now(), String(req.params.id));
  res.json({ verified: true, ...result, score });
});

apiRouter.post('/attempts/:id/stop', requirePlayer, (req, res) => {
  const result = getDb().prepare(`
    UPDATE attempts SET status = 'stopped', finalized_at = ?
    WHERE attempt_id = ? AND player_uuid = ? AND status = 'running'
  `).run(now(), String(req.params.id), playerId(req)!);
  if (!result.changes) return res.status(409).json({ error: '轮次不存在或已经结束' });
  res.json({ status: 'stopped' });
});

apiRouter.post('/event-streams', requirePlayer, (req, res) => {
  const streamId = uuidv4();
  getDb().prepare(`
    INSERT INTO event_streams (stream_id, player_uuid, scope, created_at) VALUES (?, ?, ?, ?)
  `).run(streamId, playerId(req)!, String(req.body?.scope || 'page'), now());
  res.status(201).json({ stream_id: streamId });
});

apiRouter.post('/event-streams/:id/batches', requirePlayer, (req, res) => {
  const database = getDb();
  const id = playerId(req)!;
  const stream = database.prepare(`SELECT * FROM event_streams WHERE stream_id = ? AND player_uuid = ?`)
    .get(String(req.params.id), id);
  if (!stream) return res.status(404).json({ error: '事件流不存在' });
  const events = req.body?.events as TelemetryEvent[];
  if (!Array.isArray(events) || events.length > 500) return res.status(422).json({ error: '每批需要 0-500 条事件' });

  const insert = database.prepare(`
    INSERT OR IGNORE INTO events (
      event_id, stream_id, seq, player_uuid, assignment_key, level_id, mode, attempt_id,
      event_type, element_id, interaction_id, client_time, page_instance_id, mono_ms,
      elapsed_ms, payload, event_json, server_received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const received = now();
  let inserted = 0;
  database.exec('BEGIN IMMEDIATE;');
  try {
    for (const event of events) {
      if (!event?.event_id || !Number.isInteger(event.seq) || event.seq < 1 || !event.event_type) continue;
      const canonical = { ...event, player_uuid: id, stream_id: String(req.params.id) };
      inserted += Number(insert.run(
        event.event_id, String(req.params.id), event.seq, id, event.assignment_key, event.level_id,
        event.mode, event.attempt_id, event.event_type, event.element_id, event.interaction_id,
        event.client_time, event.page_instance_id, event.mono_ms, event.elapsed_ms,
        JSON.stringify(event.payload || {}), JSON.stringify(canonical), received,
      ).changes);
    }
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
  const seqs = database.prepare(`SELECT seq FROM events WHERE stream_id = ? ORDER BY seq`).all(String(req.params.id)) as { seq: number }[];
  const present = new Set(seqs.map((row) => row.seq));
  const max = seqs.at(-1)?.seq ?? 0;
  const missing: number[] = [];
  for (let seq = 1; seq <= max; seq += 1) if (!present.has(seq)) missing.push(seq);
  res.json({ confirmed_count: inserted, max_confirmed_seq: max, missing_sequences: missing });
});

apiRouter.get('/teacher/summary', teacherGuard, (_req, res) => {
  const database = getDb();
  const players = database.prepare(`SELECT COUNT(*) AS count FROM players`).get() as { count: number };
  const attempts = database.prepare(`SELECT COUNT(*) AS count FROM attempts`).get() as { count: number };
  const events = database.prepare(`SELECT COUNT(*) AS count FROM events`).get() as { count: number };
  const progress = database.prepare(`
    SELECT assignment_key, mode, COUNT(*) AS attempts,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
      ROUND(AVG(score), 1) AS average_score
    FROM attempts GROUP BY assignment_key, mode ORDER BY assignment_key
  `).all();
  res.json({ players: players.count, attempts: attempts.count, events: events.count, progress });
});

apiRouter.get('/teacher/dashboard', teacherGuard, (_req, res) => {
  const database = getDb();
  const overview = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM players) AS players,
      (SELECT COUNT(*) FROM attempts) AS attempts,
      (SELECT COUNT(*) FROM attempts WHERE status = 'success') AS successes,
      (SELECT COUNT(*) FROM attempts WHERE status = 'running') AS active_attempts,
      (SELECT ROUND(AVG(score), 1) FROM attempts WHERE score IS NOT NULL) AS average_score,
      (SELECT COUNT(*) FROM events) AS events
  `).get();
  const modes = database.prepare(`
    SELECT mode, COUNT(*) AS attempts, COUNT(DISTINCT player_uuid) AS players,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
      ROUND(AVG(score), 1) AS average_score, ROUND(AVG(steps), 1) AS average_steps,
      ROUND(AVG(collisions), 1) AS average_collisions
    FROM attempts GROUP BY mode ORDER BY mode
  `).all();
  const languages = database.prepare(`
    SELECT COALESCE(p.language_experience, 'unknown') AS language_experience,
      COUNT(DISTINCT p.player_uuid) AS players, COUNT(a.attempt_id) AS attempts,
      SUM(CASE WHEN a.status = 'success' THEN 1 ELSE 0 END) AS successes,
      ROUND(AVG(a.score), 1) AS average_score, ROUND(AVG(a.steps), 1) AS average_steps
    FROM players p LEFT JOIN attempts a ON a.player_uuid = p.player_uuid
    GROUP BY COALESCE(p.language_experience, 'unknown') ORDER BY players DESC
  `).all();
  const levels = database.prepare(`
    SELECT assignment_key, 'L' || substr(assignment_key, 2) AS level_id, mode,
      COUNT(DISTINCT player_uuid) AS players, COUNT(*) AS attempts,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
      ROUND(AVG(score), 1) AS average_score, ROUND(AVG(steps), 1) AS average_steps,
      ROUND(AVG(collisions), 1) AS average_collisions
    FROM attempts GROUP BY assignment_key, mode ORDER BY assignment_key
  `).all();
  const eventTypes = database.prepare(`
    SELECT event_type, COUNT(*) AS count FROM events
    GROUP BY event_type ORDER BY count DESC, event_type LIMIT 12
  `).all();
  const activity = database.prepare(`
    SELECT substr(server_received_at, 1, 13) || ':00' AS hour, COUNT(*) AS count
    FROM events GROUP BY hour ORDER BY hour DESC LIMIT 24
  `).all().reverse();
  const recentAttempts = database.prepare(`
    SELECT a.attempt_id, a.assignment_key, a.mode, a.trial_index, a.status, a.steps,
      a.collisions, a.collected_count, a.score, a.started_at, a.finalized_at,
      p.display_name, substr(p.player_uuid, 1, 8) AS player_code,
      COALESCE(p.language_experience, 'unknown') AS language_experience
    FROM attempts a JOIN players p ON p.player_uuid = a.player_uuid
    ORDER BY a.started_at DESC LIMIT 30
  `).all();
  res.json({ generated_at: now(), overview, modes, languages, levels, event_types: eventTypes, activity, recent_attempts: recentAttempts });
});

apiRouter.delete('/teacher/data', teacherGuard, (_req, res) => {
  const database = getDb();
  const before = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM players) AS players,
      (SELECT COUNT(*) FROM attempts) AS attempts,
      (SELECT COUNT(*) FROM events) AS events
  `).get();
  database.exec('BEGIN IMMEDIATE;');
  try {
    database.exec(`
      DELETE FROM events;
      DELETE FROM event_streams;
      DELETE FROM attempts;
      DELETE FROM assignments;
      DELETE FROM players;
    `);
    database.exec('COMMIT;');
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
  res.json({ cleared: true, deleted: before, cleared_at: now() });
});

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

apiRouter.get('/teacher/export', teacherGuard, (req, res) => {
  const kind = req.query.kind === 'events' ? 'events' : 'attempts';
  const format = req.query.format === 'csv' ? 'csv' : 'jsonl';
  const rows = kind === 'events'
    ? getDb().prepare(`SELECT event_json FROM events ORDER BY server_received_at, stream_id, seq`).all()
        .map((row: any) => JSON.parse(row.event_json))
    : getDb().prepare(`
        SELECT a.*, p.display_name, p.language_experience FROM attempts a
        JOIN players p ON p.player_uuid = a.player_uuid
        ORDER BY a.player_uuid, a.assignment_key, a.trial_index
      `).all();
  if (format === 'jsonl') {
    res.type('application/x-ndjson').send(rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
    return;
  }
  const keys = rows.length ? Object.keys(rows[0] as object) : [];
  const csv = [keys.map(csvCell).join(','), ...rows.map((row: any) => keys.map((key) => csvCell(row[key])).join(','))].join('\n');
  res.type('text/csv').send('\ufeff' + csv);
});
