import { useState } from 'react';
import { FUTURE_SCORE_POLICY, scoreWithRelease, exportDemoPreset, type DemoManifest, type ScorePolicy } from '@coin-path/shared';
import { downloadConfiguration } from './download';

export default function ScorePlayground({ demo }: { demo: DemoManifest }) {
  const [complete, setComplete] = useState(true), [program, setProgram] = useState(true), [verified, setVerified] = useState(true);
  const [counts, setCounts] = useState({ actions: 8, actionTarget: 8, lines: 3, codeTarget: 3 });
  const [policy, setPolicy] = useState<ScorePolicy>({ ...FUTURE_SCORE_POLICY });
  const result = scoreWithRelease(demo.dependencies[0].version, { complete, actionCount: counts.actions, actionTarget: counts.actionTarget,
    programMode: program, verifiedCodeLines: verified ? counts.lines : undefined, codeTarget: counts.codeTarget }, policy);
  const number = (value: string) => Math.max(0, Math.min(10000, Math.trunc(Number(value) || 0)));
  return <div className="demo-score-playground">
    <section className="demo-panel"><h2>调整任务证据</h2><p>核验选项仅用于演示，正式赛事由服务端核验。</p>
      <div className="demo-checks"><label><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />任务已完成</label>
        <label><input type="checkbox" checked={program} onChange={e => setProgram(e.target.checked)} />编程模式</label>
        <label><input type="checkbox" checked={verified} disabled={!program} onChange={e => setVerified(e.target.checked)} />代码已核验（模拟）</label></div>
      <div className="demo-field-grid">{([['actions', '实际行动数'], ['actionTarget', '目标行动数'], ['lines', '代码行数'], ['codeTarget', '目标代码行数']] as const).map(([key, label]) =>
        <label key={key}>{label}<input type="number" min={0} max={10000} step={1} disabled={!program && ['lines', 'codeTarget'].includes(key)} value={counts[key]} onChange={e => setCounts({ ...counts, [key]: number(e.target.value) })} /></label>)}</div>
      <details><summary>调整 DEMO 分值配置</summary><p>修改仅作用于本示例，可以下载配置供其他入口复用。</p><div className="demo-field-grid">{([['completion', '完成分'], ['efficiency', '效率分'], ['programming', '代码分']] as const).map(([key, label]) =>
        <label key={key}>{label}<input type="number" min={0} max={10000} value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: number(e.target.value) })} /></label>)}</div>
        <div className="demo-actions"><button onClick={() => setPolicy({ ...FUTURE_SCORE_POLICY })}>恢复赛事预设</button><button onClick={() => downloadConfiguration('score-policy', exportDemoPreset(demo, policy))}>下载当前配置</button></div></details>
    </section>
    <section className="demo-panel demo-score-result" aria-live="polite"><span className="third-eyebrow">结果预览</span><div className="demo-total"><strong data-testid="demo-score-total">{result.total}</strong><span>/ {result.maximum} 分</span></div>
      <dl>{([['任务完成', result.completion], ['行动效率', result.efficiency], ['代码效率', result.programming]] as const).map(([label, score]) => <div key={label}><dt>{label}</dt><dd>{score} 分</dd></div>)}</dl>
      <ul>{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><small>本页不提交比赛成绩。</small></section>
  </div>;
}
