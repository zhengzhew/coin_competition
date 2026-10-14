import type { Router, RequestHandler } from 'express';
import { strawberryLevels, beachLevels, robotDemoManifests, createRobotRuntime } from '@coin-path/shared';
import { getDb } from './db.js';
import { getLevelForAssignment } from './levels.js';

interface Rule { base: number; steps: number; code_lines: number; seconds: number; min: number; max: number }
interface Config { start: string | null; end: string | null; rule: Rule | null }
const defaults: Config = { start: null, end: null, rule: null };
const codeLines = (source: string) => source.split(/\r?\n/).filter(line => line.replace(/#.*$/, '').trim()).length;
export function validateLeaderboardConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw new Error('配置必须为 JSON 对象');
  const c = value as Config;
  if ([c.start, c.end].some(v => v !== null && typeof v !== 'string')) throw new Error('时间必须为日期字符串或 null');
  if (Boolean(c.start) !== Boolean(c.end)) throw new Error('请同时设置开始时间和结束时间，或同时清空');
  if (c.start && (!Number.isFinite(Date.parse(c.start)) || !c.end || !Number.isFinite(Date.parse(c.end)) || Date.parse(c.start) >= Date.parse(c.end))) throw new Error('结束时间必须晚于开始时间');
  if (c.rule !== null) {
    if (!c.rule || typeof c.rule !== 'object' || Object.keys(c.rule).sort().join() !== 'base,code_lines,max,min,seconds,steps') throw new Error('规则需要且仅支持 base、steps、code_lines、seconds、min、max 六个字段');
    if (Object.values(c.rule).some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1000000) || c.rule.min > c.rule.max) throw new Error('规则系数必须为有限数字，min 不能大于 max');
  }
  return { start: c.start ? new Date(c.start).toISOString() : null, end: c.end ? new Date(c.end).toISOString() : null, rule: c.rule };
}
function config(): Config {
  const row = getDb().prepare('SELECT value FROM leaderboard_config WHERE id = 1').get();
  return row ? JSON.parse(String(row.value)) : defaults;
}
export function leaderboardScore(rule: Rule | null, steps: number, lines: number | null, seconds: number | null) {
  if (!rule || lines === null || seconds === null) return null;
  return Math.round(Math.max(rule.min, Math.min(rule.max, rule.base + rule.steps * steps + rule.code_lines * lines + rule.seconds * seconds)) * 100) / 100;
}
interface Entry { id: string; participant: string; name: string; steps: number; code_lines: number | null; seconds: number | null; submitted_at: string; completed: boolean; score?: number | null }

export function registerLeaderboardRoutes(router: Router, playerGuard: RequestHandler, teacherGuard: RequestHandler) {
  router.get('/teacher/leaderboard', teacherGuard, (_req, res) => res.json(config()));
  router.put('/teacher/leaderboard', teacherGuard, (req, res) => {
    try {
      const value = validateLeaderboardConfig(req.body);
      getDb().prepare('INSERT INTO leaderboard_config (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value').run(JSON.stringify(value));
      res.json(value);
    } catch (e) { res.status(422).json({ error: (e as Error).message }); }
  });
  router.post('/leaderboard/submissions', playerGuard, (req, res) => {
    const b = req.body ?? {}, uuid = /^[0-9a-f-]{36}$/i;
    const catalog = b.competition === 'farm' ? strawberryLevels : b.competition === 'beach' ? beachLevels : b.competition === 'demo' ? robotDemoManifests.map(entry => entry.configuration) : [];
    const level = catalog.find(l => l.demo_id === b.level_id && l.content_version === b.content_version);
    if (!level || !level.supported_modes.includes(b.mode) || !uuid.test(b.submission_id) || !uuid.test(b.participant_id)
      || typeof b.display_name !== 'string' || !b.display_name.trim() || b.display_name.length > 40
      || typeof b.source !== 'string' || b.source.length > 8000 || typeof b.completed !== 'boolean'
      || [b.steps, b.seconds].some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 86400)) return res.status(422).json({ error: '提交数据或关卡版本无效' });
    let steps = b.steps;
    if (level.grid_task === 'strawberry-edge') {
      try {
        const session = createRobotRuntime(level, 'auto'); session.start(b.source);
        for (let i = 0; i < 7201 && session.phase === 'running'; i++) session.tick(1 / 60);
        const result = session.snapshot();
        if (result.completed !== b.completed || result.steps !== steps) return res.status(422).json({ error: '草莓路线核验不一致' });
        steps = result.steps;
      } catch (e) { return res.status(422).json({ error: (e as Error).message }); }
    }
    const db = getDb(), owner = String(req.cookies.player_uuid);
    const existing = db.prepare('SELECT player_uuid FROM leaderboard_submissions WHERE submission_id = ?').get(b.submission_id);
    if (existing) return existing.player_uuid === owner ? res.json({ saved: true }) : res.status(409).json({ error: '提交编号冲突' });
    db.prepare(`INSERT INTO leaderboard_submissions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(b.submission_id, owner, b.participant_id, b.display_name.trim(), b.competition, b.level_id, b.mode, b.content_version, steps, b.mode === 'auto' ? codeLines(b.source) : 0, b.seconds, Number(b.completed), new Date().toISOString());
    res.status(201).json({ saved: true });
  });
  router.get('/leaderboard', (req, res) => {
    const c = config(), competition = String(req.query.competition ?? ''), level = String(req.query.level ?? ''), mode = String(req.query.mode ?? '');
    const scope = req.query.scope === 'history' ? 'history' : 'current';
    const sort = String(req.query.sort ?? 'steps'), order = req.query.order === 'desc' ? -1 : 1;
    if (!['steps', 'code_lines', 'seconds', 'score'].includes(sort) || sort === 'score' && !c.rule) return res.status(422).json({ error: '总分隐藏时不可排序，或排序字段无效' });
    let entries: Entry[] = [];
    if (competition === 'coin' || competition === 'future') {
      const rows = getDb().prepare(`SELECT a.*, p.display_name FROM attempts a JOIN players p USING(player_uuid)
        WHERE a.mode = ? AND a.finalized_at IS NOT NULL AND a.status IN ('success','incomplete','command_limit')`).all(mode);
      entries = rows.filter(a => { const l = getLevelForAssignment(String(a.assignment_key)); return l?.level_id === level && (level.startsWith('FL') ? 'future' : 'coin') === competition; }).map(a => {
        const duration = (Date.parse(String(a.finalized_at)) - Date.parse(String(a.started_at))) / 1000;
        return { id: String(a.attempt_id), participant: String(a.player_uuid), name: String(a.display_name), steps: Number(a.steps),
          code_lines: mode === 'keyboard' ? 0 : a.program_snapshot ? codeLines(String(a.program_snapshot)) : null,
          seconds: a.active_seconds === null ? Number.isFinite(duration) && duration >= 0 ? duration : null : Number(a.active_seconds),
          submitted_at: String(a.finalized_at), completed: a.status === 'success' };
      });
    } else {
      const rows = getDb().prepare(`SELECT * FROM leaderboard_submissions WHERE competition = ? AND level_id = ? AND mode = ? AND content_version = ?`).all(competition, level, mode, String(req.query.version ?? ''));
      entries = rows.map(a => ({ id: String(a.submission_id), participant: String(a.participant_id), name: String(a.display_name), steps: Number(a.steps), code_lines: Number(a.code_lines), seconds: Number(a.seconds), submitted_at: String(a.submitted_at), completed: !!a.completed }));
    }
    const latest = new Map<string, Entry>();
    for (const row of entries.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id))) {
      const inside = !c.start || row.submitted_at >= c.start && row.submitted_at <= c.end!;
      if (scope === 'current' ? inside : !inside) latest.set(row.participant, row);
    }
    const result = [...latest.values()].map(row => ({ ...row, score: leaderboardScore(c.rule, row.steps, row.code_lines, row.seconds) }));
    result.sort((a, b) => { const x = a[sort as 'steps'], y = b[sort as 'steps']; return x == null ? y == null ? a.id.localeCompare(b.id) : 1 : y == null ? -1 : (x - y) * order || a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id); });
    res.json({ start: c.start, end: c.end, score_visible: !!c.rule, scope, rows: result.map(({ participant: _private, ...row }) => row) });
  });
}
