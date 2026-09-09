import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import './TeacherDashboard.css';

type Numeric = number | null;
interface Overview { players: number; attempts: number; successes: number; active_attempts: number; average_score: Numeric; events: number; }
interface ModeRow { mode: string; attempts: number; players: number; successes: number; average_score: Numeric; average_steps: Numeric; average_collisions: Numeric; }
interface LanguageRow { language_experience: string; players: number; attempts: number; successes: number; average_score: Numeric; average_steps: Numeric; }
interface LevelRow extends ModeRow { assignment_key: string; level_id: string; }
interface EventRow { event_type: string; count: number; }
interface ActivityRow { hour: string; count: number; }
interface RecentAttempt {
  attempt_id: string; assignment_key: string; mode: string; trial_index: number; status: string;
  steps: number; collisions: number; collected_count: number; score: Numeric; final_score: Numeric; started_at: string;
  finalized_at: string | null; display_name: string; player_code: string; language_experience: string;
}
interface DashboardData {
  generated_at: string; overview: Overview; modes: ModeRow[]; languages: LanguageRow[];
  levels: LevelRow[]; event_types: EventRow[]; activity: ActivityRow[]; recent_attempts: RecentAttempt[];
}

const languageLabels: Record<string, string> = { python: '学过 Python', cpp: '只学过 C++', both: '两种都学过', none: '都没学过', unknown: '未填写' };
const eventLabels: Record<string, string> = {
  ui_click: '点击', ui_pointerdown: '按下', ui_input: '输入', ui_change: '修改完成',
  ui_focusin: '进入输入框', ui_focusout: '离开输入框', command_issued: '移动指令',
  move_success: '移动成功', collision: '碰撞', coin_collected: '拾取金币', all_collected: '收集完成',
  attempt_started: '开始挑战', attempt_verified: '成绩确认', program_run_started: '运行程序', page_view: '打开页面',
};

export default function TeacherDashboard() {
  const [key, setKey] = useState(() => sessionStorage.getItem('coin_teacher_key') || '');
  const [draftKey, setDraftKey] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearConfirming, setClearConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'keyboard' | 'python_blank'>('all');
  const [uuidDraft, setUuidDraft] = useState('');
  const [levelDraft, setLevelDraft] = useState('');
  const [query, setQuery] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async (authKey = key) => {
    if (!authKey) return false;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/teacher/dashboard?${query}`, { headers: { 'x-teacher-key': authKey } });
      if (!response.ok) throw new Error(response.status === 401 ? '教师密钥不正确' : '暂时无法读取看板数据');
      const next = await response.json();
      if (id !== requestId.current) return false;
      setData(next); setError(null); return true;
    } catch (reason) {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : '读取失败'); return false;
    } finally { if (id === requestId.current) setLoading(false); }
  }, [key, query]);

  useEffect(() => {
    if (!key) return;
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [key, load]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const next = draftKey.trim();
    if (!next) return;
    const accepted = await load(next);
    if (accepted) { sessionStorage.setItem('coin_teacher_key', next); setKey(next); setDraftKey(''); }
  };

  const logout = () => { sessionStorage.removeItem('coin_teacher_key'); setKey(''); setData(null); setError(null); };

  const download = async (kind: 'attempts' | 'events', format: 'csv' | 'jsonl') => {
    const response = await fetch(`/api/teacher/export?kind=${kind}&format=${format}&${query}`, { headers: { 'x-teacher-key': key } });
    if (!response.ok) { setError('导出失败，请重新登录'); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${kind}-${new Date().toISOString().slice(0, 10)}.${format === 'csv' ? 'csv' : 'jsonl'}`;
    anchor.click(); URL.revokeObjectURL(url);
  };

  const clearAllData = async () => {
    setClearing(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/teacher/data', {
        method: 'DELETE', headers: { 'x-teacher-key': key },
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || '清空失败，请稍后重试');
      setClearConfirming(false);
      setNotice('所有课堂数据已清空，20 关配置保持不变。');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '清空失败，请稍后重试');
    } finally { setClearing(false); }
  };

  if (!key || (!data && error)) {
    return <main className="teacher-login">
      <form onSubmit={login}>
        <div className="teacher-emblem">◆</div><span>旷野淘金 · 教师端</span><h1>行为数据看板</h1>
        <p>输入服务器环境变量 <code>TEACHER_KEY</code> 中设置的教师密钥。</p>
        <label>教师密钥<input type="password" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} autoFocus placeholder="输入教师密钥" /></label>
        {error && <div className="teacher-error">{error}</div>}
        <button type="submit" disabled={loading}>{loading ? '正在验证…' : '进入看板'}</button>
        <small>本地开发默认密钥：demo-teacher-key</small><a href="/">返回学生端</a>
      </form>
    </main>;
  }

  if (!data) return <div className="teacher-loading">正在汇总课堂数据…</div>;
  const completion = percent(data.overview.successes, data.overview.attempts);
  const filteredLevels = filter === 'all' ? data.levels : data.levels.filter((row) => row.mode === filter);
  const maxEvents = Math.max(1, ...data.event_types.map((row) => row.count));
  const maxActivity = Math.max(1, ...data.activity.map((row) => row.count));

  return <div className="teacher-page">
    <header className="teacher-header">
      <div className="teacher-brand"><i>◆</i><div><small>校园挑战 · 教师端</small><b>行为数据看板</b></div></div>
      <div className="teacher-actions"><span className={loading ? 'syncing' : ''}>{loading ? '同步中…' : `更新于 ${formatTime(data.generated_at)}`}</span><button onClick={() => void load()}>刷新</button><a href="/">学生端</a><button onClick={logout}>退出</button></div>
    </header>
    <main className="dashboard">
      <section className="dashboard-title"><div><span>课堂实时概览</span><h1>金币路径规划学习数据</h1><p>每关每种模式限 3 次正式尝试，最终分取前三次最高分；练习不计分。</p></div><div className="export-actions"><button onClick={() => void download('attempts', 'csv')}>导出成绩 CSV</button><button onClick={() => void download('events', 'jsonl')}>导出埋点 JSONL</button><button className="danger" onClick={() => { setClearConfirming(true); setNotice(null); }}>清空所有数据</button></div></section>

      <form className="dashboard-filters" onSubmit={(event) => {
        event.preventDefault();
        setQuery(new URLSearchParams({ uuid: uuidDraft.trim(), level: levelDraft }).toString());
      }}>
        <label>学生 UUID<input value={uuidDraft} onChange={(event) => setUuidDraft(event.target.value)} placeholder="完整 UUID 或开头几位" /></label>
        <label>关卡<select value={levelDraft} onChange={(event) => setLevelDraft(event.target.value)}>
          <option value="">全部关卡</option>
          {Array.from({ length: 20 }, (_, index) => { const id = `L${String(index + 1).padStart(2, '0')}`; return <option key={id} value={id}>{id} · 第 {index + 1} 关</option>; })}
        </select></label>
        <button type="submit" disabled={loading}>查询</button>
        <button type="button" onClick={() => { setUuidDraft(''); setLevelDraft(''); setQuery(''); }}>重置筛选</button>
        <small>当前：{new URLSearchParams(query).get('uuid') || '全部学生'} · {new URLSearchParams(query).get('level') || '全部关卡'}。统计和导出均按此范围，挑战记录显示最近 30 次。</small>
      </form>

      {clearConfirming && <section className="clear-confirm" role="alertdialog" aria-labelledby="clear-data-title">
        <div><b id="clear-data-title">确认清空所有课堂数据？</b><small>此操作不受筛选条件限制。全部学生身份、挑战成绩和行为埋点都会永久删除，20 关配置不会改变。</small></div>
        <button onClick={() => setClearConfirming(false)} disabled={clearing}>取消</button>
        <button className="danger" onClick={() => void clearAllData()} disabled={clearing}>{clearing ? '正在清空…' : '确认清空'}</button>
      </section>}
      {notice && <div className="teacher-notice" role="status">{notice}</div>}
      {error && <div className="teacher-error dashboard-error" role="alert">{error}</div>}

      <section className="metric-grid">
        <Metric label="学生人数" value={data.overview.players} note="独立 UUID" tone="forest" />
        <Metric label="挑战轮次" value={data.overview.attempts} note={`${data.overview.active_attempts} 轮进行中`} tone="sand" />
        <Metric label="成功完成" value={data.overview.successes} note={`完成率 ${completion}%`} tone="green" />
        <Metric label="最终平均分" value={scoreText(data.overview.average_score)} note="每关取前三次最高分" tone="gold" />
        <Metric label="行为事件" value={data.overview.events} note="点击、输入与移动" tone="clay" />
      </section>

      <section className="dashboard-grid two-thirds">
        <article className="dash-card"><CardTitle eyebrow="模式比较" title="键盘与 Python 表现" />
          <div className="mode-cards">{data.modes.length ? data.modes.map((row) => <div className="mode-row" key={row.mode}>
            <div className="mode-icon">{row.mode === 'keyboard' ? '⌨' : '</>'}</div><div className="mode-copy"><b>{modeLabel(row.mode)}</b><small>{row.players} 人 · {row.attempts} 轮</small><div className="progress"><i style={{ width: `${percent(row.successes, row.attempts)}%` }} /></div></div>
            <div className="mode-number"><b>{scoreText(row.average_score)}</b><small>最终平均分</small></div><div className="mode-number"><b>{percent(row.successes, row.attempts)}%</b><small>完成率</small></div>
          </div>) : <Empty />}</div>
        </article>
        <article className="dash-card"><CardTitle eyebrow="学情分组" title="编程经历对比" />
          <div className="language-list">{data.languages.map((row) => <div key={row.language_experience}><span><b>{languageLabels[row.language_experience] || row.language_experience}</b><small>{row.players} 人 / {row.attempts} 轮</small></span><em>{scoreText(row.average_score)} 分</em></div>)}</div>
        </article>
      </section>

      <section className="dashboard-grid half">
        <article className="dash-card"><CardTitle eyebrow="行为构成" title="高频交互事件" />
          <div className="event-bars">{data.event_types.length ? data.event_types.map((row) => <div key={row.event_type}><span>{eventLabels[row.event_type] || row.event_type}</span><div><i style={{ width: `${Math.max(3, row.count / maxEvents * 100)}%` }} /></div><b>{row.count}</b></div>) : <Empty />}</div>
        </article>
        <article className="dash-card"><CardTitle eyebrow="上传趋势" title="每小时行为事件" />
          <div className="activity-chart">{data.activity.length ? data.activity.map((row) => <div key={row.hour} title={`${row.hour}：${row.count}`}><i style={{ height: `${Math.max(4, row.count / maxActivity * 100)}%` }} /><span>{row.hour.slice(11, 13)}</span></div>) : <Empty />}</div>
        </article>
      </section>

      <article className="dash-card level-card"><div className="table-heading"><CardTitle eyebrow="关卡表现" title="40 个任务的数据进度" /><div className="table-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button><button className={filter === 'keyboard' ? 'active' : ''} onClick={() => setFilter('keyboard')}>键盘</button><button className={filter === 'python_blank' ? 'active' : ''} onClick={() => setFilter('python_blank')}>Python</button></div></div>
        <div className="table-scroll"><table><thead><tr><th>任务</th><th>模式</th><th>学生</th><th>轮次</th><th>完成率</th><th>最终平均分</th><th>平均步数</th><th>平均碰撞</th></tr></thead><tbody>{filteredLevels.map((row) => <tr key={row.assignment_key}><td><b>{row.assignment_key}</b><small>{row.level_id}</small></td><td><span className={`mode-tag ${row.mode}`}>{modeLabel(row.mode)}</span></td><td>{row.players}</td><td>{row.attempts}</td><td><strong>{percent(row.successes, row.attempts)}%</strong></td><td>{scoreText(row.average_score)}</td><td>{scoreText(row.average_steps)}</td><td>{scoreText(row.average_collisions)}</td></tr>)}</tbody></table>{!filteredLevels.length && <Empty />}</div>
      </article>

      <article className="dash-card recent-card"><CardTitle eyebrow="实时记录" title="最近 30 次挑战" /><div className="table-scroll"><table><thead><tr><th>学生</th><th>学情</th><th>任务</th><th>第几次</th><th>结果</th><th>步数</th><th>碰撞</th><th>本次得分</th><th>本关最高分</th><th>开始时间</th></tr></thead><tbody>{data.recent_attempts.map((row) => <tr key={row.attempt_id}><td><b>{row.display_name}</b><small>{row.player_code}</small></td><td>{languageLabels[row.language_experience] || row.language_experience}</td><td><span className={`mode-tag ${row.mode}`}>{row.assignment_key}</span></td><td>{row.trial_index}</td><td><span className={`result-tag ${row.status}`}>{statusLabel(row.status)}</span></td><td>{row.steps}</td><td>{row.collisions}</td><td><strong>{scoreText(row.score)}</strong></td><td>{scoreText(row.final_score)}</td><td>{formatTime(row.started_at)}</td></tr>)}</tbody></table>{!data.recent_attempts.length && <Empty />}</div></article>
    </main>
  </div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string | number; note: string; tone: string }) { return <article className={`metric ${tone}`}><span>{label}</span><b>{value}</b><small>{note}</small></article>; }
function CardTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="card-title"><span>{eyebrow}</span><h2>{title}</h2></div>; }
function Empty() { return <div className="empty">还没有可展示的数据</div>; }
function percent(part: number, total: number) { return total ? Math.round(part / total * 1000) / 10 : 0; }
function scoreText(value: Numeric) { return value === null || value === undefined ? '—' : value; }
function modeLabel(mode: string) { return mode === 'keyboard' ? '键盘' : 'Python'; }
function statusLabel(status: string) { return ({ success: '完成', running: '进行中', stopped: '已停止', incomplete: '未完成', abandoned: '已放弃', order_violation: '顺序错误', command_limit: '指令超限' } as Record<string, string>)[status] || status; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
