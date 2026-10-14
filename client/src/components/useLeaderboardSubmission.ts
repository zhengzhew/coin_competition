import { useEffect, useRef, useState } from 'react';
import { createUuid, type ThirdDemo } from '@coin-path/shared';

export const sourceLineCount = (source: string) => source.split(/\r?\n/).filter(line => line.replace(/#.*$/, '').trim()).length;
export function useLeaderboardSubmission(competition: string, demo: ThirdDemo, player: { id: string; name: string }, mode: string, source: string,
  state: { phase: string; elapsed: number; steps?: number; completed: boolean }) {
  const run = useRef<{ id: string; source: string; sent: boolean } | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null);
  const previousPhase = useRef('ready');
  const mounted = useRef(true);
  const [notice, setNotice] = useState(''), [failed, setFailed] = useState(false);
  const [score, setScore] = useState<number | null | undefined>();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submit = async (payload: Record<string, unknown>) => {
    setNotice('正在提交排行榜…'); setFailed(false);
    try {
      const bootstrap = await fetch('/api/players/bootstrap', { method: 'POST', credentials: 'include' });
      if (!bootstrap.ok) throw new Error('无法连接成绩服务');
      const response = await fetch('/api/leaderboard/submissions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || '提交失败');
      if (mounted.current && pending.current === payload) { setNotice('已提交排行榜'); setFailed(false); setScore(body.score ?? null); }
    } catch (e) { if (mounted.current && pending.current === payload) { setNotice(`排行榜提交失败：${(e as Error).message}`); setFailed(true); } }
  };
  useEffect(() => {
    const previous = previousPhase.current; previousPhase.current = state.phase;
    if (state.phase === 'ready') { run.current = null; pending.current = null; setNotice(''); setFailed(false); setScore(undefined); return; }
    if (state.phase === 'running' && (!run.current || !['running', 'paused'].includes(previous))) { run.current = { id: createUuid(), source, sent: false }; pending.current = null; setNotice(''); setFailed(false); setScore(undefined); }
    if (state.phase === 'completed' && state.completed && state.elapsed > 0 && run.current && !run.current.sent) {
      run.current.sent = true;
      const payload = { submission_id: run.current.id, participant_id: player.id, display_name: player.name, competition, level_id: demo.demo_id,
        content_version: demo.content_version, mode, source: mode === 'auto' ? run.current.source : '', steps: state.steps ?? 0, seconds: state.elapsed, completed: state.completed };
      pending.current = payload; void submit(payload);
    }
  }, [state.phase, state.elapsed, state.completed, state.steps, competition, demo, mode, player.id, player.name, source]);
  return { notice, failed, score, retry: () => { if (pending.current) void submit(pending.current); } };
}
