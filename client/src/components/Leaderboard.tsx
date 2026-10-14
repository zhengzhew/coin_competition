import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Leaderboard.css';

interface Scope { competition: string; level: string; mode: string; version?: string }
interface Entry { id: string; name: string; steps: number; code_lines: number | null; seconds: number | null; score: number | null; submitted_at: string; completed: boolean }
interface Data { start: string | null; end: string | null; score_visible: boolean; rows: Entry[] }
export function LevelMetrics({ steps, lines, seconds, scope, note, children }: { steps: number; lines: number; seconds: number; scope: Scope; note?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="level-metrics" aria-label="本关数据">
    <div title={note}><small>本关步数</small><b data-testid="level-steps">{Number(steps.toFixed(2))}</b></div>
    <div><small>代码行数</small><b data-testid="level-lines">{lines}</b></div>
    <div><small>所用时间</small><b data-testid="level-seconds">{seconds.toFixed(1)}<em> 秒</em></b></div>
    <button className="leaderboard-open" onClick={() => setOpen(true)}>🏆 排行榜</button>{children}
    {open && <Leaderboard scope={scope} onClose={() => setOpen(false)} />}
  </div>;
}
function Leaderboard({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const [period, setPeriod] = useState('current'), [sort, setSort] = useState('steps'), [order, setOrder] = useState('asc');
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    const query = new URLSearchParams({ ...scope, scope: period, sort, order });
    fetch(`/api/leaderboard?${query}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) { if (response.status === 422 && sort === 'score') setSort('steps'); throw new Error(body.error || '读取排行榜失败'); }
      return body as Data;
    }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope.competition, scope.level, scope.mode, scope.version, period, sort, order, refresh]);
  const toggleSort = (key: string) => { if (key === sort) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(key); setOrder(key === 'score' ? 'desc' : 'asc'); } };
  return createPortal(<div className="leaderboard-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} className="leaderboard-dialog" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" onKeyDown={e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') { const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'); if (!buttons?.length) return; const first = buttons[0], last = buttons[buttons.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }}>
      <div className="leaderboard-heading"><div><small>当前关卡 · {scope.mode === 'manual' || scope.mode === 'keyboard' ? '手动操作' : '编程控制'}</small><h2 id="leaderboard-title">挑战排行榜</h2></div><button aria-label="关闭排行榜" onClick={onClose}>×</button></div>
      <div className="leaderboard-tabs"><button aria-pressed={period === 'current'} onClick={() => setPeriod('current')}>指定时段</button><button aria-pressed={period === 'history'} onClick={() => setPeriod('history')}>历史记录</button><button onClick={() => setRefresh(n => n + 1)}>刷新</button></div>
      <p>{data?.start ? `${new Date(data.start).toLocaleString('zh-CN')} 至 ${new Date(data.end!).toLocaleString('zh-CN')}` : '教师尚未限定时间，指定时段展示全部提交。'}{period === 'history' && data?.start ? ' 历史记录展示该时段之外的提交。' : ''}</p>
      <small>每位玩家显示所选范围内最近一次提交；点击列名切换升序／降序。暂停时间不计入用时。</small>
      {error && <p role="alert">{error}<button onClick={() => setRefresh(n => n + 1)}>重试</button></p>}
      <div className="leaderboard-table"><table><thead><tr><th>序号</th><th>玩家</th>{[['steps', '步数'], ['code_lines', '代码行数'], ['seconds', '所用时间'], ['score', '总分']].map(([key, label]) => <th key={key} aria-sort={sort === key ? order === 'asc' ? 'ascending' : 'descending' : 'none'}><button disabled={key === 'score' && !data?.score_visible} onClick={() => toggleSort(key)}>{label}{sort === key ? order === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>)}</tr></thead><tbody>{!loading && !error && data?.rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><b>{row.name}</b><small>{row.completed ? '已完成' : '未完成'} · {new Date(row.submitted_at).toLocaleString('zh-CN')}</small></td><td>{row.steps}</td><td>{row.code_lines ?? '—'}</td><td>{row.seconds == null ? '—' : `${row.seconds.toFixed(1)} 秒`}</td><td className="leaderboard-score">{row.score ?? '？？'}</td></tr>)}</tbody></table></div>
      {loading ? <p role="status">正在读取排行榜…</p> : !error && !data?.rows.length && <p role="status">这个范围还没有提交记录。</p>}
      {!data?.score_visible && <p>教师尚未导入计分规则，总分暂时隐藏。</p>}
    </section>
  </div>, document.body);
}
