import { beachLevels, robotDemoManifests, strawberryLevels } from '@coin-path/shared';
import { allLevels } from './levels.js';
import { getDb } from './db.js';
import { leaderboardScore, type ScoreRule } from './scoring.js';

export const teacherCompetitionNames = {
  coin: '旷野淘金', future: '未来城市', farm: '生态农场', beach: '潮汐拾光（贝壳）', demo: '机器人 DEMO',
};

export function teacherCatalog() {
  const formal = allLevels();
  const local = { farm: strawberryLevels, beach: beachLevels, demo: robotDemoManifests.map(entry => entry.configuration) };
  const stored = getDb().prepare('SELECT DISTINCT competition, level_id, mode FROM leaderboard_submissions WHERE completed = 1').all();
  return Object.entries(teacherCompetitionNames).map(([id, title]) => {
    const levels = id === 'coin' || id === 'future'
      ? formal.filter(level => level.level_id.startsWith('F') === (id === 'future'))
        .map(level => ({ id: level.level_id, title: level.title, modes: ['keyboard', 'python_blank'] as string[] }))
      : local[id as keyof typeof local].map(level => ({ id: level.demo_id, title: level.title, modes: [...level.supported_modes] as string[] }));
    // Keep historical levels/modes selectable even if they have left the current catalog.
    for (const row of stored.filter(row => row.competition === id)) {
      const level = levels.find(level => level.id === row.level_id);
      if (!level) levels.push({ id: String(row.level_id), title: `${row.level_id}（历史关卡）`, modes: [String(row.mode)] });
      else if (!level.modes.includes(String(row.mode))) level.modes.push(String(row.mode));
    }
    return { id, title, source: id === 'coin' || id === 'future' ? 'attempts' : 'submissions', levels };
  });
}

export interface TeacherSubmission {
  submission_id: string; player_uuid: string; participant_id: string; display_name: string;
  competition: string; level_id: string; mode: string; content_version: string;
  steps: number; code_lines: number; seconds: number; completed: number; submitted_at: string;
}

export function submissionInsights(records: TeacherSubmission[], rule: ScoreRule | null) {
  const catalog = teacherCatalog();
  const rows = records.map(row => ({ ...row,
    title: catalog.find(event => event.id === row.competition)?.levels.find(level => level.id === row.level_id)?.title ?? row.level_id,
    score: leaderboardScore(rule, row.steps, row.code_lines, row.seconds),
  }));
  const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null;
  function aggregate(entries: typeof rows) {
    return { students: new Set(entries.map(row => `${row.competition}:${row.participant_id}`)).size, submissions: entries.length,
      average_steps: mean(entries.map(row => row.steps)), average_code_lines: mean(entries.map(row => row.code_lines)),
      average_seconds: mean(entries.map(row => row.seconds)), average_score: mean(entries.flatMap(row => row.score === null ? [] : [row.score])) };
  }
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = JSON.stringify([row.competition, row.level_id, row.mode, row.content_version]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const levels = [...groups.values()].map(entries => {
    const { competition, level_id, title, mode, content_version } = entries[0];
    return { competition, level_id, title, mode, content_version, ...aggregate(entries) };
  });
  return { overview: aggregate(rows), levels, rows };
}
