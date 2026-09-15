import { levelIdForAssignment, type LevelDef } from '@coin-path/shared';

export interface InsightAttempt {
  attempt_id: string; player_uuid: string; display_name: string; assignment_key: string;
  mode: string; trial_index: number; status: string; score: number | null;
  steps: number; collisions: number; started_at: string; finalized_at: string | null;
}
export interface InsightEvent { attempt_id: string | null; player_uuid: string; event_type: string; payload: string; }
const round = (n: number) => Math.round(n * 10) / 10;
function mean(values: number[]) { return values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null; }
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
const ended = (a: InsightAttempt) => a.status !== 'running';
const scored = (a: InsightAttempt) => ended(a) && a.score !== null && Number.isFinite(a.score);

export function buildInsights(attempts: InsightAttempt[], events: InsightEvent[], levels: LevelDef[]) {
  const formal = attempts.filter(a => a.trial_index >= 1 && a.trial_index <= 3);
  const preparation = new Map<string, number>();
  const owners = new Map(formal.map(a => [a.attempt_id, a.player_uuid]));
  let invalidPreparation = 0;
  for (const event of events) {
    if (event.event_type !== 'attempt_started' || !event.attempt_id || owners.get(event.attempt_id) !== event.player_uuid) continue;
    try {
      const value = JSON.parse(event.payload).entry_to_start_ms;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        if (!preparation.has(event.attempt_id)) preparation.set(event.attempt_id, value / 1000);
      } else if (value !== undefined) invalidPreparation++;
    } catch { invalidPreparation++; }
  }
  const grouped = new Map<string, InsightAttempt[]>();
  for (const attempt of formal) {
    const key = `${attempt.player_uuid}:${attempt.assignment_key}`;
    grouped.set(key, [...(grouped.get(key) ?? []), attempt]);
  }
  const journeys = [...grouped.values()].map(rows => {
    rows.sort((a, b) => a.trial_index - b.trial_index);
    const completed = rows.filter(scored);
    const first = rows.find(a => a.trial_index === 1 && scored(a));
    const best = completed.length ? Math.max(...completed.map(a => a.score!)) : null;
    return {
      player_uuid: rows[0].player_uuid, display_name: rows[0].display_name,
      assignment_key: rows[0].assignment_key, level_id: levelIdForAssignment(rows[0].assignment_key), mode: rows[0].mode,
      attempts: rows.length, ended: rows.filter(ended).length,
      first_score: first?.score ?? null, best_score: best,
      gain: first && completed.length >= 2 ? round(best! - first.score!) : null,
      mastered: best !== null && best >= 100,
      exhausted: rows.length >= 3 && rows.every(ended) && best !== null && best < 100,
      scores: rows.map(a => ({ trial: a.trial_index, score: scored(a) ? a.score : null, status: a.status })),
    };
  });
  function aggregate(rows: InsightAttempt[], groups: typeof journeys) {
    const finished = rows.filter(ended), first = groups.filter(g => g.first_score !== null);
    const gains = groups.flatMap(g => g.gain === null ? [] : [g.gain]);
    const times = finished.flatMap(a => {
      const seconds = a.finalized_at ? (Date.parse(a.finalized_at) - Date.parse(a.started_at)) / 1000 : NaN;
      return Number.isFinite(seconds) && seconds >= 0 ? [seconds] : [];
    });
    const prep = rows.filter(a => a.mode === 'keyboard').flatMap(a => preparation.has(a.attempt_id) ? [preparation.get(a.attempt_id)!] : []);
    return {
      students: new Set(rows.map(a => a.player_uuid)).size, journeys: groups.length, attempts: rows.length,
      ended: finished.length, active: rows.length - finished.length,
      first_n: first.length, first_score: mean(first.map(g => g.first_score!)),
      first_mastery: first.length ? round(first.filter(g => g.first_score! >= 100).length / first.length * 100) : null,
      best_score: mean(groups.flatMap(g => g.best_score === null ? [] : [g.best_score])),
      mastered: groups.filter(g => g.mastered).length,
      mastery_rate: groups.length ? round(groups.filter(g => g.mastered).length / groups.length * 100) : null,
      retry_rate: groups.length ? round(groups.filter(g => g.attempts > 1).length / groups.length * 100) : null,
      exhausted: groups.filter(g => g.exhausted).length, gain: mean(gains), gain_n: gains.length,
      preparation_s: median(prep), preparation_n: prep.length,
      preparation_eligible: rows.filter(a => a.mode === 'keyboard').length,
      duration_s: median(times), duration_n: times.length,
      collisions: mean(finished.map(a => a.collisions)),
      stopped: finished.filter(a => ['stopped', 'abandoned', 'incomplete', 'command_limit'].includes(a.status)).length,
    };
  }
  const levelRows = levels.flatMap(level => ['keyboard', 'python_blank'].map(mode => {
    const assignment = mode === 'keyboard' ? level.keyboard_id : level.python_id;
    const rows = formal.filter(a => a.assignment_key === assignment);
    const groups = journeys.filter(g => g.assignment_key === assignment);
    const stats = aggregate(rows, groups);
    const diagnosis = stats.first_n < 5 ? '样本不足，先积累至少 5 个首轮成绩'
      : (stats.first_mastery ?? 0) >= 90 ? '首轮满分集中：检查是否缺乏区分度'
      : stats.exhausted / Math.max(stats.journeys, 1) >= .3 ? '多次尝试仍未满分：复查目标说明与难度'
      : (stats.collisions ?? 0) >= 3 ? '碰撞较多：观察墙体辨识与操作反馈'
      : (stats.gain ?? 0) >= 15 ? '重试提升明显：检查反馈是否帮助改进'
      : '暂无明显信号，结合个体轨迹观察';
    return { assignment_key: assignment, level_id: level.level_id, title: level.title,
      mode, budget: Boolean(level.step_limit), ...stats, diagnosis };
  }));
  return {
    overview: aggregate(formal, journeys), levels: levelRows,
    modes: ['keyboard', 'python_blank'].map(mode => ({ mode,
      ...aggregate(formal.filter(a => a.mode === mode), journeys.filter(g => g.mode === mode)) })),
    journeys,
    quality: { excluded_legacy: attempts.length - formal.length, missing_scores: formal.filter(a => ended(a) && !scored(a)).length,
      missing_timestamps: formal.filter(a => ended(a) && (!a.finalized_at || !Number.isFinite(Date.parse(a.finalized_at) - Date.parse(a.started_at)) || Date.parse(a.finalized_at) < Date.parse(a.started_at))).length,
      invalid_preparation: invalidPreparation, validation_errors: events.filter(e => e.event_type === 'program_validation_failed').length },
  };
}
