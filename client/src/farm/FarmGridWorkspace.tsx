import { useEffect, useMemo, useRef, useState } from 'react';
import { createRobotRuntime, solveStrawberryRoute, strawberryScore, THIRD_FIXED_STEP, type ThirdDemo } from '@coin-path/shared';
import { farmLevels, farmPath, type FarmLevel } from './catalog';
import StrawberryBoard3D from './StrawberryBoard3D';
import FarmCodeEditor from './FarmCodeEditor';
import { CompetitionHeader, CompetitionMission, CompetitionActions } from '../components/CompetitionTemplate';
import { competitionModules } from '../competition-modules';
import '../App.css';
import '../components/LevelNav.css';
import '../components/PythonEditor.css';
import '../components/RobotEditor.css';
import '../FutureCity.css';
import '../third/ThirdGame.css';
import './Farm.css';
import './Strawberry.css';

const commands = [
  ['前进', 'move(1)', 'move(x)'], ['后退', 'move(-1)', 'move(-x)'],
  ['左转', 'turn_left()', 'turn_left()'], ['右转', 'turn_right()', 'turn_right()'],
  ['采摘', 'grab()', 'grab()'], ['放下', 'release()', 'release()'],
] as const;
interface Props {
  demo: FarmLevel; player: { id: string; name: string }; go: (path: string) => void;
  bestSteps?: number; isCompleted: (demo: ThirdDemo) => boolean;
  onComplete: (demo: ThirdDemo, steps: number) => void; storageNotice: string;
}
export default function FarmGridWorkspace({ demo, player, go, bestSteps, isCompleted, onComplete, storageNotice }: Props) {
  const [session] = useState(() => createRobotRuntime(demo, 'auto'));
  const [state, setState] = useState(() => session.snapshot());
  const storageKey = `farm.program.${player.id}.${demo.demo_id}.${demo.content_version}.grid`;
  const [source, setSource] = useState(() => { try { return localStorage.getItem(storageKey)?.slice(0, 8000) ?? demo.starter; } catch { return demo.starter; } });
  const [error, setError] = useState(''), [draftNotice, setDraftNotice] = useState('');
  const phase = useRef(state.phase);
  const optimal = useMemo(() => solveStrawberryRoute(demo).steps, [demo]);
  const sync = () => { const next = session.snapshot(); phase.current = next.phase; setState(next); };
  useEffect(() => {
    try { localStorage.setItem(storageKey, source); setDraftNotice(''); } catch { setDraftNotice('草稿暂时无法保存，请保留当前页面。'); }
  }, [source, storageKey]);
  useEffect(() => {
    let frame = 0, last = 0, accumulator = 0;
    const update = () => { const next = session.snapshot(); phase.current = next.phase; setState(next); };
    const animate = (now: number) => {
      if (last) accumulator += Math.min((now - last) / 1000, .1);
      last = now;
      while (accumulator >= THIRD_FIXED_STEP) { session.tick(THIRD_FIXED_STEP); accumulator -= THIRD_FIXED_STEP; }
      if (session.phase === 'running' || phase.current !== session.phase) update();
      frame = requestAnimationFrame(animate);
    };
    const stop = () => { session.stop('已暂停。点击运行程序，从起点重新执行。'); accumulator = 0; last = 0; update(); };
    const visibility = () => { if (document.hidden) stop(); };
    frame = requestAnimationFrame(animate);
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); session.stop(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); };
  }, [session]);
  useEffect(() => { if (state.completed) onComplete(demo, state.steps!); }, [state.completed, state.steps, demo, onComplete]);
  const running = state.phase === 'running', index = farmLevels.indexOf(demo), steps = state.steps ?? 0;
  const reset = () => { session.reset(); setError(''); sync(); };
  const canReset = state.phase === 'stopped' || state.completed;
  const run = () => { try { session.start(source); setError(''); sync(); } catch (e) { setError((e as Error).message); } };
  return <div className="third-game-shell farm-shell"><section className="app future-city third-game third-workspace farm-game strawberry-game competition-template" data-module="farm" data-mode="auto" data-simulation="grid">
    <CompetitionHeader module={competitionModules.farm} onHome={() => go(farmPath())} mode="编程控制" modeLabel="本关操作方式" modeTestId="farm-control-mode" player={player}
      timer={<div className="farm-timer"><span>本轮用时</span><output data-testid="farm-timer">{state.elapsed.toFixed(1)}<small> 秒</small></output></div>} />
    <div className="app-body">
      <nav className="level-nav" aria-label="关卡导航"><div className="nav-heading"><span>任务地图</span><b>{farmLevels.length} 关</b></div><section className="stage-group"><div className="stage-label"><span>草莓采摘</span></div><div className="stage-levels">{farmLevels.map((item, n) => <button key={item.demo_id} className={`level-btn${item === demo ? ' active' : ''}`} aria-current={item === demo ? 'page' : undefined} aria-label={`${n + 1} ${item.title}`} onClick={() => go(farmPath(item))}><span>{String(n + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{isCompleted(item) ? '✓ 完成' : `${item.scene_config.objects.length}株`}</small></button>)}</div></section>
        <details className="farm-nav-instructions" open><summary>操作提示</summary><ul><li>左下角 (0,0)，横纵坐标 0–7。</li><li>停在草莓上下左右的相邻格，面向草莓后采摘。</li><li>每次仅携带一株；小车到任意边缘格后放下。</li><li>草莓格不可通行，采摘后可通行。</li></ul></details>
        <details className="farm-nav-instructions"><summary>步数与评分</summary><ul><li>移动一格计一步；转向、采摘和放下不计步。</li><li>交付全部草莓后计分：最短步数 ÷ 本轮步数 × 100，向下取整。</li><li>步数越少，得分越高。最优路线得 100 分。</li></ul></details>
      </nav>
      <main className="game-area"><div className="workspace-grid robot-workspace">
        <section className="board-panel"><CompetitionMission number={index + 1} title={demo.title} objective={demo.objective} />
          <div className="third-stage" data-testid="third-stage" data-x={state.x} data-map-y={7 - state.z} data-heading={state.heading} data-phase={state.phase} data-collected={state.collected.length} data-holding={state.holding || ''} data-steps={steps}><StrawberryBoard3D state={state} /></div>
          <div className="status-bar"><div><small>行驶步数</small><b data-testid="farm-steps">{steps}</b></div><div><small>已交付</small><b data-testid="third-progress">{state.collected.length}<em> / {state.objects.length} 株</em></b></div><div><small>个人最佳</small><b data-testid="farm-best">{bestSteps ?? '—'}{bestSteps !== undefined && <em> 步</em>}</b></div><div className={`status-pill ${state.completed ? 'status-success' : ''}`}>{({ ready: '准备就绪', running: '运行中', stopped: '已停止', completed: '已完成' })[state.phase]}</div></div>
        </section>
        <aside className="control-column"><section className="python-editor robot-editor third-program-editor" aria-label="程序编辑器"><div className="editor-header"><h3>指令程序</h3><span className="farm-editor-units">{running && state.line ? `执行第 ${state.line} 行` : '按格移动 · 转向 90°'}</span></div>
          <div className="third-editor-fields"><div className="robot-palette third-command-palette strawberry-palette" aria-label="可用指令">{commands.map(([label, command, template]) => <button key={command} disabled={running} title={`插入 ${command}`} onClick={() => setSource(s => `${s}${s && !s.endsWith('\n') ? '\n' : ''}${command}`)}><b>{label}</b><code>{template}</code></button>)}</div>
          <p className="strawberry-code-hint">x 填格数；正数前进，负数后退。</p><FarmCodeEditor source={source} running={running} activeLine={running ? state.line : null} onChange={value => { setSource(value); setError(''); }} />
          {error && <p className="editor-error" role="alert">{error}</p>}{draftNotice && <small role="status">{draftNotice}</small>}</div>
          <CompetitionActions running={running} canReset={canReset} onRun={run} onReset={reset} onStop={() => { session.stop('程序已停止。点击重置，小车回到起点。'); sync(); }} testId="third-start" />
        </section>
        {state.completed ? <section className="farm-result" role="status" aria-label="本轮成绩"><div><span>全部交付完成</span><strong data-testid="farm-score">{strawberryScore(steps, optimal, true)}<small> 分</small></strong></div><p>本轮 {steps} 步 · 最短可达 {optimal} 步</p><div className="farm-completion-actions"><button className="primary-action" onClick={() => reset()}>再挑战一次</button>{farmLevels[index + 1] && <button className="secondary-action" onClick={() => go(farmPath(farmLevels[index + 1]))}>下一关 →</button>}</div></section>
          : <div className={`message${state.phase === 'stopped' ? ' strawberry-stopped' : ''}`} role="status">{state.message}</div>}
        </aside>
      </div></main>
    </div><footer><span>生态农场 · 草莓采摘</span><span role={storageNotice ? 'status' : undefined}>{storageNotice || '进度、最佳步数与草稿保存在本浏览器 · 本地评分'}</span></footer>
  </section></div>;
}
