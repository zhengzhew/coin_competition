import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { THIRD_FIXED_STEP, thirdMapPosition, type ThirdAction, type ThirdDemo, type ThirdMode } from '@coin-path/shared';
import { ThirdSession } from './controls/session';
import CityBoard3D from '../components/CityBoard3D';
import { categoryLabels, modeLabels, simulationLabels, demoPath, demos } from './demo-catalog';
import '../App.css';
import '../components/GameBoard.css';
import '../components/LevelNav.css';
import '../components/PythonEditor.css';
import '../components/RobotEditor.css';
import '../FutureCity.css';
import './ThirdGame.css';
const SimulationScene = lazy(() => import('./simulation3d/SimulationScene'));
const keyActions: Record<string, ThirdAction> = { w: 'forward', arrowup: 'forward', s: 'backward', arrowdown: 'backward',
  a: 'turn_left', arrowleft: 'turn_left', d: 'turn_right', arrowright: 'turn_right', g: 'grab', r: 'release' };
const controls = [['forward', 'W / ↑', '前进'], ['turn_left', 'A / ←', '左转'], ['backward', 'S / ↓', '后退'],
  ['turn_right', 'D / →', '右转'], ['grab', 'G', '夹取'], ['release', 'R', '放下']] as const;

export default function DemoWorkspace({ demo, mode, go }: { demo: ThirdDemo; mode: ThirdMode; go: (path: string) => void }) {
  const [session] = useState(() => new ThirdSession(demo, mode));
  const [state, setState] = useState(() => session.snapshot());
  const storageKey = `third.program.${demo.demo_id}.${demo.content_version}.${demo.simulation}`;
  const [source, setSource] = useState(() => {
    try { const draft = localStorage.getItem(storageKey); return draft !== null && draft.length <= 8000 ? draft : demo.starter; } catch { return demo.starter; }
  });
  const [error, setError] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [ready, setReady] = useState(demo.simulation === 'grid');
  const pointerActions = useRef(new Set<ThirdAction>());
  const sync = useCallback(() => setState(session.snapshot()), [session]);
  const onReady = useCallback((value: boolean) => { setReady(value); if (!value) { session.stop('场景暂时不可用，已停止运行。'); sync(); } }, [session, sync]);
  useEffect(() => { if (mode === 'auto') try { localStorage.setItem(storageKey, source); setStorageNotice(''); } catch { setStorageNotice('浏览器未能保存草稿；请保留当前页面。'); } }, [source, storageKey, mode]);
  useEffect(() => {
    let frame = 0, last = 0, accumulator = 0;
    const animate = (now: number) => {
      if (last) accumulator += Math.min((now - last) / 1000, .1);
      last = now;
      while (accumulator >= THIRD_FIXED_STEP) { session.tick(THIRD_FIXED_STEP); accumulator -= THIRD_FIXED_STEP; }
      if (session.phase === 'running' || stateRef.current.phase !== session.phase) sync();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || event.repeat || mode !== 'manual' || session.phase !== 'running') return;
      const action = keyActions[event.key.toLowerCase()]; if (!action || demo.category === 'collect' && ['grab', 'release'].includes(action)) return;
      event.preventDefault(); session.press(action); sync();
    };
    const up = (event: KeyboardEvent) => { const action = keyActions[event.key.toLowerCase()]; if (action) { session.release(action); sync(); } };
    const releasePointer = () => { pointerActions.current.forEach(action => session.release(action)); pointerActions.current.clear(); };
    const stop = () => { session.stop('已暂停。返回后点击开始，或重新运行程序。'); releasePointer(); accumulator = 0; last = 0; sync(); };
    const visibility = () => { if (document.hidden) stop(); };
    const focus = (event: FocusEvent) => { if (editable(event.target) && mode === 'manual') { session.stop('输入时已暂停机器人。'); sync(); } };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop);
    window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    return () => {
      cancelAnimationFrame(frame); session.stop();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop);
      window.removeEventListener('pointerup', releasePointer); window.removeEventListener('pointercancel', releasePointer);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus);
    };
  }, [session, mode, demo.category, sync]);
  const stateRef = useRef(state); stateRef.current = state;
  const actionLabel = (action: string, label: string) => demo.simulation === 'simulation3d' ?
    action === 'grab' ? '合拢夹爪' : action === 'release' ? '张开夹爪' : label : label;
  const gripText = state.gripper ? ({ open: '夹爪已张开', opening: '夹爪正在张开', closing: '夹爪正在合拢',
    closed: '夹爪已闭合（空夹）', holding: `双侧夹持：${state.holding}`, blocked: '夹爪受阻，未夹稳' })[state.gripper.phase]
    : state.holding ? `夹爪持有：${state.holding}` : '夹爪已张开';
  const running = state.phase === 'running';
  const start = () => { try { session.start(source); setError(''); sync(); } catch (e) { setError((e as Error).message); } };
  const stop = () => { session.stop(); sync(); };
  const reset = () => { session.reset(); setError(''); sync(); };
  const levels = demos.filter(item => item.category === demo.category && item.simulation === demo.simulation && item.supported_modes.includes(mode));
  const grid = session.engine.gridPresentation();
  const mapPosition = thirdMapPosition(state.x, state.z, demo.scene_config.depth);
  const selectedAction = (action: ThirdAction) => {
    const templates: Record<ThirdAction, string> = { forward: `forward(${demo.simulation === 'grid' ? 1 : 12})`, backward: `backward(${demo.simulation === 'grid' ? 1 : 12})`, turn_left: 'turn_left(90)', turn_right: 'turn_right(90)', grab: 'grab()', release: 'release()', wait: 'wait(1)' };
    setSource(current => `${current}${current.endsWith('\n') || !current ? '' : '\n'}${templates[action]}`);
  };
  return <div className="third-game-shell"><section className="app future-city third-game third-workspace" data-category={demo.category} data-mode={mode} data-simulation={demo.simulation}>
    <header className="app-header">
      <a className="brand" href="/demo/" style={{ color: 'inherit', textDecoration: 'none' }} onClick={e => { e.preventDefault(); go('/demo/'); }}><div className="brand-mark">✦</div><div><span>DEMO 展示中心 · {categoryLabels[demo.category]}</span><b>{simulationLabels[demo.simulation]}</b></div></a>
      <div className="header-mode-controls"><div className="current-mode" aria-label="当前操作方式">{mode === 'auto' ? '</> 自动 · 程序操控' : '⌨ 手动 · 键盘操控'}</div></div>
      <div className="header-actions"><button className="third-return" onClick={() => go(demoPath(demo.category, mode, demo.simulation))}>← DEMO 列表</button><button className="third-return" onClick={() => go(demoPath(demo.category))}>返回分类</button></div>
    </header>
    <div className="app-body">
      <nav className="level-nav" aria-label="关卡导航">
        <div className="nav-heading"><span>任务地图</span><b>{levels.length} 关</b></div>
        <section className="stage-group"><div className="stage-label"><span>{categoryLabels[demo.category]} · {modeLabels[mode]}</span><small>{simulationLabels[demo.simulation]}</small></div>
          <div className="stage-levels">{levels.map((item, index) => <button key={item.demo_id} className={`level-btn${item.demo_id === demo.demo_id ? ' active' : ''}`} aria-current={item.demo_id === demo.demo_id ? 'page' : undefined} aria-label={`${index + 1} ${item.title}`} disabled={item.status === 'planned'} onClick={() => go(demoPath(item.category, mode, item.simulation, item.demo_id))}><span>{String(index + 1).padStart(2, '0')}</span><small>{item.scene_config.objects.length}点</small></button>)}</div>
        </section>
        <section className="stage-group"><div className="stage-label"><span>更多玩法</span></div><div className="stage-levels"><button className="level-btn" disabled aria-label="DEMO 准备中"><span>待更新</span></button></div></section>
      </nav>
      <main className="game-area"><div className="workspace-grid robot-workspace">
        <section className="mission-card"><div className="mission-number">{String(levels.findIndex(item => item.demo_id === demo.demo_id) + 1).padStart(2, '0')}</div><div className="mission-copy"><h1>{demo.title}</h1></div><span className="third-sample-status">{demo.status === 'sample' ? '功能验证样例' : '已开放 DEMO'}</span></section>
        <section className="board-panel">
          <div className="panel-heading"><div><span>{demo.simulation === 'grid' ? '未来城市 · 棋盘模拟' : '智慧农场 · 3D 模拟'}</span><b>{demo.objective}</b><small className="board-rule-hint">{demo.simulation === 'grid' ? '按格移动；左右转向 90°。' : '连续驾驶；按住移动，松开减速。'}{demo.category === 'place' ? demo.simulation === 'simulation3d' ? '方块可推动；G 合拢、R 张开夹爪。' : '车头前方夹取或放下货物。' : '接近目标即可收集。'}</small></div><div className="legend robot-legend">{demo.category === 'collect' ? <span><i className="legend-patrol" />收集点</span> : <><span><i className="legend-cargo" />货物</span><span><i className="legend-dock" />交货点</span></>}</div></div>
          {demo.simulation === 'simulation3d' && <div className="third-physical-scale" aria-label="场景尺寸"><span>地图 120 × 120 cm · 每格 12 cm</span><span>车体 19 × 19 · 夹爪 19 × 6 · 货块 6 × 6 cm</span></div>}
          <div className="third-stage" data-testid="third-stage" data-x={state.x.toFixed(4)} data-map-y={mapPosition.y.toFixed(4)} data-z={state.z.toFixed(4)} data-heading={state.heading.toFixed(4)} data-phase={state.phase} data-collected={state.collected.length} data-holding={state.holding || ''} data-gripper={state.gripper?.phase} data-objects={JSON.stringify(state.objects)}>
            {grid ? <CityBoard3D level={grid.level} state={grid.state} /> : <Suspense fallback={<p className="city3d-loading">正在加载三维场地…</p>}><SimulationScene demo={demo} state={state} onReady={onReady} /></Suspense>}
          </div>
          <div className="status-bar"><div><small>行动次数</small><b>{state.actions}</b></div><div><small>已完成目标</small><b data-testid="third-progress">{state.collected.length}<em> / {state.objects.length}</em></b></div><div className={`status-pill ${state.completed ? 'status-success' : ''}`}>{({ ready: '准备就绪', running: '运行中', stopped: '已停止', completed: '已完成' })[state.phase]}</div></div>
        </section>
        <aside className="control-column">
          <section className="attempt-summary" aria-label="本关状态"><div className="attempt-summary-metrics"><div><span>当前模式</span><strong>{modeLabels[mode]}<small> · 试用</small></strong></div><div><span>本轮用时</span><strong>{state.elapsed.toFixed(1)}<small> 秒</small></strong></div></div><p>功能验证样例，暂不计正式比赛成绩。</p></section>
          {mode === 'auto' ? <section className="python-editor robot-editor third-program-editor" aria-label="程序编辑器">
            <div className="editor-header"><h3>指令程序</h3><button className="robot-restart" onClick={reset}>重置</button></div>
            <div className="code-line-metrics"><span>当前 <b>{source.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length}</b> 行</span><span>{running && state.line ? `执行第 ${state.line} 行` : demo.simulation === 'grid' ? '距离：格' : '距离：厘米'}</span></div>
            <div className="third-editor-fields">
            <div className="robot-palette third-command-palette">{controls.filter(([action]) => demo.category === 'place' || !['grab', 'release'].includes(action)).map(([action, , label]) => <button disabled={running} key={action} onClick={() => selectedAction(action)}><b>{actionLabel(action, label)}</b><code>{action}()</code></button>)}<button disabled={running} onClick={() => setSource(s => `${s}${s && !s.endsWith('\n') ? '\n' : ''}for i in range(2):\n    forward(${demo.simulation === 'grid' ? 1 : 12})`)}><b>循环</b><code>for i in range(n)</code></button></div>
            <label className="robot-editor-target" htmlFor="third-program">{demo.simulation === 'grid' ? '前进、后退按格填写，转向为 90° 的倍数' : '距离填写厘米（如 forward(12) 前进一格），转向填写角度'}</label>
            <textarea id="third-program" className="third-program-source" aria-label="指令程序" spellCheck={false} autoComplete="off" value={source} disabled={running} maxLength={8000} onChange={e => setSource(e.target.value)} onKeyDown={e => {
              if (e.key === 'Tab') { e.preventDefault(); const field = e.currentTarget, start = field.selectionStart, end = field.selectionEnd;
                setSource(source.slice(0, start) + '    ' + source.slice(end)); requestAnimationFrame(() => field.setSelectionRange(start + 4, start + 4)); }
            }} />
            <div className="third-source-tools"><button className="robot-restart" disabled={running} onClick={() => { setSource(demo.starter); setError(''); }}>恢复示例程序</button><small>{storageNotice || '草稿已保存在本浏览器'}</small></div>
            {error && <p className="editor-error" role="alert">{error}</p>}
            </div><div className="third-program-actions"><button className="run-btn" disabled={running || !ready} onClick={start} data-testid="third-start">{running ? '正在执行…' : '▶ 运行程序'}</button>
            <button className="secondary-action third-stop" disabled={!running} onClick={stop}>停止</button></div>
          </section> : <section className="keyboard-card">
            <div className="mini-heading"><span>{demo.category === 'place' ? '驾驶与夹爪' : '方向控制'}</span><small>相对车头方向</small></div>
            <div className="robot-controls">{controls.filter(([action]) => demo.category === 'place' || !['grab', 'release'].includes(action)).map(([action, key, label]) => <button key={action} disabled={!running} aria-label={`${actionLabel(action, label)} ${key}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointerActions.current.add(action); session.press(action); sync(); }}
              onPointerUp={() => { session.release(action); pointerActions.current.delete(action); sync(); }} onPointerCancel={() => { session.release(action); pointerActions.current.delete(action); }}
              onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); if (!e.repeat) { session.press(action); sync(); } } }} onKeyUp={e => { if (['Enter', ' '].includes(e.key)) { session.release(action); sync(); } }}><kbd>{key.split(' / ')[0]}</kbd><span>{actionLabel(action, label)}{demo.simulation === 'grid' && ['forward', 'backward'].includes(action) ? '一格' : demo.simulation === 'grid' && action.startsWith('turn') ? ' 90°' : ''}</span></button>)}</div>
            <p className="robot-holding">{gripText}{state.gripper && <small> · 开口 {state.gripper.gap.toFixed(1)} cm</small>}</p><p className="third-key-help">{demo.simulation === 'grid' ? '按一下走一格，也可点击方向按钮。' : '按住方向键连续驾驶，松开减速。货块可能滑动或转动。'}</p>
            <button className="primary-action" disabled={running || !ready} onClick={start} data-testid="third-start">▶ 开始控制</button><div className="third-manual-actions"><button className="secondary-action" disabled={!running} onClick={stop}>停止</button><button className="secondary-action" onClick={reset}>重置</button></div>
          </section>}
          <div className={`message${state.completed ? ' success' : ''}`} role="status">{state.message}</div>
          <details className="third-instructions"><summary>玩法说明与指令</summary><p>{demo.category === 'collect' ? '同一目标仅收集一次。' : demo.simulation === 'simulation3d' ? '货块可直接推动或双侧夹持搬运；完整进入同字母方框并停稳才计入目标。离开目标区会取消该块的到位状态。' : '面向前方货物夹取，放入同字母目标区完成任务。'}</p><p>forward(n)、backward(n)、turn_left(角度)、turn_right(角度)、wait(秒){demo.category === 'place' ? '、grab()、release()' : ''}。循环体缩进 4 个空格。</p><p>每轮最长 120 秒，最多 256 条展开指令。{demo.simulation === 'simulation3d' ? '摆放采用平面接触与摩擦：grab() 合拢夹爪，release() 张开夹爪；没有对准也会空夹，货块不会自动吸附。' : ''}</p></details>
        </aside>
      </div></main>
    </div>
    <footer><span>DEMO 展示中心 · {categoryLabels[demo.category]} · {modeLabels[mode]}</span><span>{demo.simulation === 'grid' ? '棋盘模拟：按格移动' : '3D 模拟：连续运动'} · 本地试用</span></footer>
  </section></div>;
}
