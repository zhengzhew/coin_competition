import { useEffect, useState } from 'react';
import './Leaderboard.css';
const sample = { base: 100, steps: -1, code_lines: -2, seconds: -0.5, min: 0, max: 100 };
const localDate = (iso: string | null) => { if (!iso) return ''; const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export default function LeaderboardSettings({ auth }: { auth: string }) {
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [rule, setRule] = useState('');
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  useEffect(() => { let live = true;
    fetch('/api/teacher/leaderboard', { headers: { 'x-teacher-key': auth } }).then(async r => { if (!r.ok) throw new Error('读取排行榜设置失败'); return r.json(); }).then(c => { if (live) { setStart(localDate(c.start)); setEnd(localDate(c.end)); setRule(c.rule ? JSON.stringify(c.rule, null, 2) : ''); setLoaded(true); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [auth]);
  const save = async () => {
    setError(''); setMessage(''); setBusy(true);
    try {
      const body = { start: start ? new Date(start).toISOString() : null, end: end ? new Date(end).toISOString() : null, rule: rule.trim() ? JSON.parse(rule) : null };
      const response = await fetch('/api/teacher/leaderboard', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-teacher-key': auth }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage('已保存，所有游戏使用此时间范围和计分规则；重新打开或刷新排行榜即可生效。');
    } catch (e) { setError(e instanceof SyntaxError ? 'JSON 格式有误，请检查括号、逗号和数字。' : (e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="dash-card leaderboard-settings" aria-label="全局排行榜设置"><h2>全局排行榜设置</h2><p>时间范围对所有游戏生效，按提交时间筛选；各游戏、关卡、模式分别排名。同一玩家展示范围内最近一次成功完成的记录。</p>
    <div className="leaderboard-fields"><label>开始时间<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label>结束时间<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label><button onClick={() => { setStart(''); setEnd(''); }}>展示全部时间</button></div>
    <p>时间按当前浏览器时区显示。总分 = base + steps × 步数 + code_lines × 代码行数 + seconds × 秒数，限定在 min 至 max 之间，保留两位小数。负数表示扣分。</p>
    <label>导入 JSON 规则<input type="file" accept=".json,application/json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 10000) { setError('规则文件最多 10 KB'); return; } try { const text = await file.text(); setRule(JSON.stringify(JSON.parse(text), null, 2)); setError(''); setMessage('已读入规则，请点击保存使其生效。'); } catch { setError('无法读取有效的 JSON 文件'); } e.target.value = ''; }} /></label>
    <textarea aria-label="计分规则 JSON" value={rule} onChange={e => setRule(e.target.value)} placeholder="未导入规则：总分显示 ？？，不可排序" spellCheck={false} />
    <button onClick={() => setRule(JSON.stringify(sample, null, 2))}>填入规则示例</button><button onClick={() => setRule('')}>清空规则（隐藏总分）</button><button disabled={!loaded || busy} onClick={() => void save()}>{busy ? '保存中…' : '保存排行榜设置'}</button>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
