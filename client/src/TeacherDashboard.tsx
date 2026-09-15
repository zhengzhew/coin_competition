import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import './TeacherDashboard.css';
type Numeric = number | null;
interface Stats {
  students: number; journeys: number; attempts: number; active: number; first_n: number;
  first_score: Numeric; first_mastery: Numeric; best_score: Numeric; mastered: number; mastery_rate: Numeric;
  retry_rate: Numeric; exhausted: number; gain: Numeric; gain_n: number; preparation_s: Numeric;
  preparation_n: number; preparation_eligible: number; duration_s: Numeric; duration_n: number; collisions: Numeric;
}
interface Level extends Stats { assignment_key: string; level_id: string; title: string; mode: string; budget: boolean; diagnosis: string; }
interface Journey { player_uuid: string; display_name: string; assignment_key: string; mode: string; best_score: Numeric; gain: Numeric; scores: { trial: number; score: Numeric; status: string }[]; }
interface Student { player_uuid: string; display_name: string; attempts: number; events: number; }
interface Scope extends Student { streams: number; assignments: number; }
interface Data {
  generated_at: string; overview: { events: number }; students: Student[];
  insights: { overview: Stats; levels: Level[]; modes: (Stats & { mode: string })[]; journeys: Journey[];
    quality: { excluded_legacy: number; missing_scores: number; missing_timestamps: number; invalid_preparation: number; validation_errors: number } };
}
const fmt = (n: Numeric | undefined, suffix = '') => n == null ? '—' : `${n}${suffix}`;
const modeName = (m: string) => m === 'keyboard' ? '键盘操控' : '代码操控';
const statusName = (s: string) => ({ running: '进行中', success: '已结算', stopped: '已停止', abandoned: '已放弃', incomplete: '未完成', command_limit: '指令超限' }[s] || s);

export default function TeacherDashboard() {
  const [key, setKey] = useState(() => sessionStorage.getItem('coin_teacher_key') || '');
  const [draftKey, setDraftKey] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [uuid, setUuid] = useState('');
  const [level, setLevel] = useState('');
  const [mode, setMode] = useState('');
  const [competition, setCompetition] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('design');
  const [page, setPage] = useState(0);
  const [scope, setScope] = useState<Scope | null>(null);
  const [clearAll, setClearAll] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async (auth = key) => {
    if (!auth) return false;
    const id = ++requestId.current; setLoading(true);
    try {
      const response = await fetch(`/api/teacher/dashboard?${query}`, { headers: { 'x-teacher-key': auth } });
      if (!response.ok) throw new Error(response.status === 401 ? '教师密钥不正确' : '读取失败，请检查后端连接');
      const result = await response.json();
      if (id !== requestId.current) return false;
      setData(result); setError(''); return true;
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : '读取失败'); return false; }
    finally { if (id === requestId.current) setLoading(false); }
  }, [key, query]);
  useEffect(() => { if (!key) return; void load(); const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000); return () => window.clearInterval(timer); }, [key, load]);
  const login = async (e: FormEvent) => { e.preventDefault(); const auth = draftKey.trim(); if (auth && await load(auth)) { sessionStorage.setItem('coin_teacher_key', auth); setKey(auth); } };
  const download = async (kind: 'attempts' | 'events', scopeQuery = query) => {
    try {
      const format = kind === 'attempts' ? 'csv' : 'jsonl';
      const response = await fetch(`/api/teacher/export?kind=${kind}&format=${format}&${scopeQuery}`, { headers: { 'x-teacher-key': key } });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a');
      a.href = url; a.download = `${kind === 'attempts' ? '逐次成绩' : '行为记录'}-${Date.now()}.${format}`; a.click(); URL.revokeObjectURL(url);
    } catch { setError('导出失败，请检查连接或重新登录'); }
  };
  const previewDelete = async (id: string) => {
    setBusy(true); setScope(null); setConfirm('');
    try { const r = await fetch(`/api/teacher/players/${encodeURIComponent(id)}/data`, { headers: { 'x-teacher-key': key } }); if (!r.ok) throw new Error(); setScope(await r.json()); }
    catch { setError('无法读取完整删除范围，请刷新重试'); } finally { setBusy(false); }
  };
  const deleteData = async () => {
    if (clearAll ? confirm !== '清空所有数据' : !scope || confirm !== scope.player_uuid) return;
    setBusy(true);
    try {
      const r = await fetch(clearAll ? '/api/teacher/data' : `/api/teacher/players/${encodeURIComponent(scope!.player_uuid)}/data`, { method: 'DELETE', headers: { 'x-teacher-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_uuid: confirm }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error || '删除失败');
      setNotice(clearAll ? '全部课堂数据已永久删除。' : `已永久删除 ${scope!.player_uuid} 的全部数据，其他 UUID 不变。`);
      setScope(null); setClearAll(false); setConfirm(''); setPage(0); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败'); } finally { setBusy(false); }
  };
  if (!key || (!data && error)) return <main className="teacher-login"><form onSubmit={login}><span>校园测试赛 · 共享教师端</span><h1>测试分析看板</h1><p>查看学生表现，定位值得优化的关卡。</p><label>教师密钥<input type="password" value={draftKey} onChange={e => setDraftKey(e.target.value)} autoFocus /></label>{error && <p role="alert">{error}</p>}<button disabled={loading}>进入看板</button><a href="/">进入金币赛</a><a href="/future/">进入未来城市</a></form></main>;
  if (!data) return <div className="teacher-loading">正在汇总测试数据…</div>;
  const s = data.insights.overview, q = data.insights.quality, params = new URLSearchParams(query);
  const journeys = data.insights.journeys, pages = Math.max(1, Math.ceil(journeys.length / 20)), currentPage = Math.min(page, pages - 1);
  return <div className="teacher-page">
    <header className="teacher-header"><div className="teacher-brand"><i>◆</i><div><small>校园测试赛 · 共享数据后台</small><b>测试分析看板</b></div></div><div className="teacher-actions"><span>{loading ? '同步中…' : `更新于 ${new Date(data.generated_at).toLocaleTimeString('zh-CN')}`}</span><button onClick={() => void load()}>刷新</button><a href="/">金币赛</a><a href="/future/">未来城市</a><button onClick={() => { sessionStorage.removeItem('coin_teacher_key'); setKey(''); setData(null); }}>退出</button></div></header>
    <main className="dashboard">
      <section className="dashboard-title"><div><span>先看首次难度，再看重试进步</span><h1>让测试数据指导关卡迭代</h1><p>前三次正式尝试计入分析；练习与历史第 4 次之后的记录不参与成绩汇总。</p></div><div className="export-actions"><button onClick={() => void download('attempts')}>导出逐次成绩</button><button onClick={() => void download('events')}>导出行为记录</button></div></section>
      <form className="dashboard-filters" onSubmit={e => { e.preventDefault(); setPage(0); setQuery(new URLSearchParams({ uuid: uuid.trim(), level, mode, competition }).toString()); }}>
        <label>学生 UUID<input value={uuid} onChange={e => setUuid(e.target.value)} placeholder="完整 UUID 或前缀，仅用于查询" /></label>
        <label>测试赛<select value={competition} onChange={e => { setCompetition(e.target.value); setLevel(''); }}><option value="">全部测试赛</option><option value="coin">旷野淘金</option><option value="future">未来城市</option></select></label>
        <label>关卡<select value={level} onChange={e => setLevel(e.target.value)}><option value="">全部关卡</option>{(competition ? [competition] : ['coin', 'future']).map(event => <optgroup key={event} label={event === 'future' ? '未来城市' : '旷野淘金'}>{Array.from({ length: 20 }, (_, i) => <option key={i} value={`${event === 'future' ? 'FL' : 'L'}${String(i + 1).padStart(2, '0')}`}>第 {i + 1} 关</option>)}</optgroup>)}</select></label>
        <label>操作模式<select value={mode} onChange={e => setMode(e.target.value)}><option value="">全部模式</option><option value="keyboard">键盘操控</option><option value="python_blank">代码操控</option></select></label>
        <button type="submit" disabled={loading}>应用筛选</button><button type="button" onClick={() => { setUuid(''); setLevel(''); setMode(''); setCompetition(''); setQuery(''); setPage(0); }}>重置</button>
        <small>当前：{params.get('competition') === 'future' ? '未来城市' : params.get('competition') === 'coin' ? '旷野淘金' : '全部测试赛'} · {params.get('uuid') || '全部学生'} · {params.get('level') || '全部关卡'} · {params.get('mode') ? modeName(params.get('mode')!) : '全部模式'}。分析与导出使用同一范围；删除 UUID 时始终删除该学生全部测试赛、关卡和模式。</small>
      </form>
      {error && <div className="teacher-error" role="alert">{error}</div>}{notice && <div className="teacher-notice" role="status">{notice}</div>}
      <section className="metric-grid"><Metric label="正式参与学生" value={s.students} note={`${s.journeys} 个学生×关卡×模式样本`} /><Metric label="首次平均分" value={fmt(s.first_score)} note={`${s.first_n} 个有效首轮成绩`} /><Metric label="最终平均分" value={fmt(s.best_score)} note="每个样本取前三次最高分" /><Metric label="满分达成率" value={fmt(s.mastery_rate, '%')} note={`${s.mastered} / ${s.journeys} 个已开始样本`} /><Metric label="重试提升" value={fmt(s.gain, ' 分')} note={`${s.gain_n} 个有首轮及重试成绩的配对样本`} /></section>
      <nav className="analysis-tabs" aria-label="分析视角">{[['design','关卡诊断'],['students','学生与逐次成绩'],['quality','口径与数据管理']].map(([id,title]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{title}</button>)}</nav>
      {tab === 'design' && <>
        <div className="analysis-note">按对应模式上限衡量满分达成：未来城市新六关键盘 <b>80 分</b>、代码 <b>100 分</b>；其他关卡为 100 分。诊断是待验证线索，不是定论；少于 5 个首轮样本不作诊断。</div>
        <section className="dashboard-grid half">{data.insights.modes.filter(row => !params.get('mode') || params.get('mode') === row.mode).map(row => <article className="dash-card" key={row.mode}><Title title={modeName(row.mode)} note={`${row.students} 人 · ${row.journeys} 个关卡样本`} /><div className="comparison-metrics"><div><span>首次 → 最终</span><b>{fmt(row.first_score)} → {fmt(row.best_score)}</b></div><div><span>重试比例</span><b>{fmt(row.retry_rate, '%')}</b></div><div><span>次数耗尽未满分</span><b>{row.exhausted}</b></div></div><p className="analysis-caption">模式由学生自选，关卡覆盖可能不同。请筛选同一关卡比较，不将差异解释为因果。</p></article>)}</section>
        <article className="dash-card level-card"><Title title="哪里太易，哪里容易卡住？" note="按关卡顺序观察难度梯度" /><div className="table-scroll"><table><thead><tr>{['关卡 / 模式','样本 / 首轮有效','首轮均分 / 满分率','最终均分 / 满分率','重试提升 / 配对数','次数耗尽未满分','准备中位秒 / 样本','执行中位秒 / 样本','平均碰撞','观察与下一步'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{data.insights.levels.map(row => <tr key={row.assignment_key}><td><b>{row.level_id} · {row.title}</b><small>{modeName(row.mode)} · {row.budget ? '预算取舍' : '完整收集'}</small></td><td>{row.journeys} / {row.first_n}</td><td>{fmt(row.first_score)} / {fmt(row.first_mastery, '%')}</td><td>{fmt(row.best_score)} / {fmt(row.mastery_rate, '%')}</td><td>{fmt(row.gain)} / {row.gain_n}</td><td>{row.exhausted}</td><td>{row.mode === 'keyboard' ? `${fmt(row.preparation_s)} / ${row.preparation_n}` : '未采集'}</td><td>{fmt(row.duration_s)} / {row.duration_n}</td><td>{fmt(row.collisions)}</td><td className="diagnosis-cell">{row.diagnosis}</td></tr>)}</tbody></table></div></article>
      </>}
      {tab === 'students' && <>
        <article className="dash-card level-card"><Title title="逐次成绩与个人变化" note="同一 UUID、同一关卡、同一模式配对" /><div className="table-scroll"><table><thead><tr>{['学生','任务','第一次','第二次','第三次','最终最高分','重试提升'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{journeys.slice(currentPage * 20, currentPage * 20 + 20).map(row => <tr key={`${row.player_uuid}:${row.assignment_key}`}><td><b>{row.display_name}</b><small>{row.player_uuid}</small></td><td>{row.assignment_key}<small>{modeName(row.mode)}</small></td>{[1,2,3].map(trial => { const a = row.scores.find(a => a.trial === trial); return <td key={trial}>{a ? <>{fmt(a.score)}<small>{statusName(a.status)}</small></> : '未尝试'}</td>; })}<td><strong>{fmt(row.best_score)}</strong></td><td>{fmt(row.gain)}</td></tr>)}</tbody></table></div>{!journeys.length && <Empty />}<div className="analysis-pagination"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages} 页 · {journeys.length} 条</span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></div></article>
        <article className="dash-card"><Title title="学生数据管理" note="可先按 UUID 前缀查询，再选择完整 UUID" /><p className="analysis-caption">下方计数服从筛选；删除前重新读取完整范围。不会按前缀批量删除。</p><div className="table-scroll student-management"><table><thead><tr><th>学生 / 完整 UUID</th><th>范围内轮次</th><th>范围内事件</th><th>操作</th></tr></thead><tbody>{data.students.map(row => <tr key={row.player_uuid}><td><b>{row.display_name}</b><small>{row.player_uuid}</small></td><td>{row.attempts}</td><td>{row.events}</td><td><button className="danger" disabled={busy} onClick={() => void previewDelete(row.player_uuid)}>删除此 UUID 数据</button></td></tr>)}</tbody></table></div>{!data.students.length && <Empty />}</article>
      </>}
      {tab === 'quality' && <>
        <article className="dash-card level-card"><Title title="先确认数据能回答什么" note="缺失不等于 0，行为数量不等于学习效果" /><dl className="definitions">
          <dt>计分样本</dt><dd>按 UUID＋关卡＋模式分组，只看前三次正式尝试。进行中不计入均分；停止、放弃保留已记录成绩。当前 {s.attempts} 次正式尝试，{s.active} 次进行中。</dd>
          <dt>满分达成率</dt><dd>至少一次达到对应模式最高分的样本 / 所有已开始样本（未来城市新六关键盘 80 分，其他为 100 分）。进行中也在分母内；首轮满分率仅以有效首轮成绩为分母。</dd>
          <dt>重试提升</dt><dd>有效首轮＋至少一次有效重试的配对样本：最高分减首轮分。单次尝试不混入；不能等同于长期学习效果。</dd>
          <dt>准备时间</dt><dd>键盘进入关卡到点击开始，按正式轮次关联去重后取中位数，覆盖 {s.preparation_n} / {s.preparation_eligible} 次。代码模式尚未采集同口径数据，不做横向比较。</dd>
          <dt>执行时间与碰撞</dt><dd>开始到结算/停止的墙钟时间，含停顿和离开页面；不含代码编写时间。碰撞是结束轮次的平均次数，不等同于能力。</dd>
          <dt>完整性</dt><dd>排除历史超三次记录 {q.excluded_legacy} 条；结束但缺分 {q.missing_scores} 条；时间异常/缺失 {q.missing_timestamps} 条；准备时间异常事件 {q.invalid_preparation} 条。缺失值显示“—”。</dd>
          <dt>交互诊断</dt><dd>范围内 {data.overview.events} 个事件、代码输入校验失败 {q.validation_errors} 次（可能含练习）。事件量用于排查交互问题，不作为学习成绩。</dd>
          <dt>版本与对照限制</dt><dd>两个测试赛按独立任务编号统计，可用测试赛筛选比较。旧金币赛历史轮次没有可靠地图版本区分，改版前后成绩可能混合。已停止采集语言经历，不再作为主分组。比较改版效果需要分批测试并记录版本、班级与日期。</dd>
        </dl></article><article className="dash-card"><Title title="全量数据管理" note="危险操作，不受筛选限制" /><p className="analysis-caption">建议先备份。删除不可撤销，关卡配置不受影响。</p><button className="danger" onClick={() => { setClearAll(true); setConfirm(''); }}>清空所有数据</button></article>
      </>}
      {(scope || clearAll) && <div className="data-delete-overlay"><section className="data-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">{clearAll ? '清空所有课堂数据？' : '删除这个学生的全部数据？'}</h2>{scope && <><b>{scope.display_name}</b><code>{scope.player_uuid}</code><p>全部测试赛、关卡和模式：{scope.attempts} 次尝试、{scope.events} 个事件、{scope.streams} 个事件流、{scope.assignments} 个任务及学生身份。其他 UUID 不受影响。</p><div className="export-actions"><button onClick={() => void download('attempts', new URLSearchParams({ uuid: scope.player_uuid }).toString())}>备份该学生成绩</button><button onClick={() => void download('events', new URLSearchParams({ uuid: scope.player_uuid }).toString())}>备份该学生行为</button></div></>}<p>永久删除，无法撤销，不受筛选限制。请先让相关学生退出测试；重新进入会获得新身份和次数。</p><label>{clearAll ? '输入“清空所有数据”确认' : '输入完整 UUID 确认'}<input autoFocus autoComplete="off" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></label>{error && <p role="alert">{error}</p>}<div className="dialog-actions"><button disabled={busy} onClick={() => { setScope(null); setClearAll(false); }}>取消</button><button className="danger" disabled={busy || confirm !== (clearAll ? '清空所有数据' : scope?.player_uuid)} onClick={() => void deleteData()}>{busy ? '正在删除…' : '确认永久删除'}</button></div></section></div>}
    </main>
  </div>;
}
function Metric({ label, value, note }: { label: string; value: string | number; note: string }) { return <article className="metric forest"><span>{label}</span><b>{value}</b><small>{note}</small></article>; }
function Title({ title, note }: { title: string; note: string }) { return <div className="card-title"><span>{note}</span><h2>{title}</h2></div>; }
function Empty() { return <div className="empty">当前范围暂无数据</div>; }
