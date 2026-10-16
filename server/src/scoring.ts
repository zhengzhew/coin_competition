export interface ScoreRule { base: number; steps: number; code_lines: number; seconds: number; min: number; max: number }
export const codeLines = (source: string) => source.split(/\r?\n/).filter(line => line.replace(/#.*$/, '').trim()).length;

export function leaderboardScore(rule: ScoreRule | null, steps: number, lines: number | null, seconds: number | null) {
  if (!rule || lines === null || seconds === null) return null;
  return Math.round(Math.max(rule.min, Math.min(rule.max, rule.base + rule.steps * steps + rule.code_lines * lines + rule.seconds * seconds)) * 100) / 100;
}

export function formalMetrics(a: Record<string, unknown>) {
  const duration = (Date.parse(String(a.finalized_at)) - Date.parse(String(a.started_at))) / 1000;
  return { steps: Number(a.steps),
    code_lines: a.mode === 'keyboard' ? 0 : typeof a.program_snapshot === 'string' ? codeLines(a.program_snapshot) : null,
    seconds: a.active_seconds == null ? Number.isFinite(duration) && duration >= 0 ? duration : null : Number(a.active_seconds) };
}
