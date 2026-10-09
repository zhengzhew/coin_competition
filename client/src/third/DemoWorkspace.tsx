import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { THIRD_FIXED_STEP, THIRD_OID_SPEED_FACTOR, thirdMapPosition, type ThirdAction, type ThirdDemo, type ThirdMode } from '@coin-path/shared';
import { createRobotRuntime, migrateThirdProgramCommands } from '@coin-path/shared';
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

interface FarmPresentation {
  player: { id: string; name: string }; levels: ThirdDemo[]; isCompleted: (demo: ThirdDemo) => boolean; storageNotice: string;
  path: (demo: ThirdDemo) => string; onHome: () => void; onComplete: (demo: ThirdDemo) => void;
}

export default function DemoWorkspace({ demo, mode, go, farm }: { demo: ThirdDemo; mode: ThirdMode; go: (path: string) => void; farm?: FarmPresentation }) {
  const [session] = useState(() => createRobotRuntime(demo, mode));
  const [state, setState] = useState(() => session.snapshot());
  const storageKey = `${farm ? `farm.program.${farm.player.id}` : 'third.program'}.${demo.demo_id}.${demo.content_version}.${demo.simulation}`;
  const [source, setSource] = useState(() => {
    try { const draft = localStorage.getItem(storageKey); return migrateThirdProgramCommands(draft !== null && draft.length <= 8000 ? draft : demo.starter); } catch { return demo.starter; }
  });
  const [error, setError] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [commandGroup, setCommandGroup] = useState<'normal' | 'oid'>('normal');
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
  const completedCallback = farm?.onComplete;
  useEffect(() => { if (state.completed) completedCallback?.(demo); }, [state.completed, completedCallback, demo]);
  const actionLabel = (action: string, label: string) => demo.simulation === 'simulation3d' ?
    action === 'grab' ? '合拢夹爪' : action === 'release' ? '张开夹爪' : label : label;
  const gripText = state.gripper ? ({ open: '夹爪已张开', opening: '夹爪正在张开', closing: '夹爪正在合拢',
    closed: '夹爪已闭合（空夹）', holding: `双侧夹持：${state.holding}`, blocked: '夹爪受阻，未夹稳' })[state.gripper.phase]
    : state.holding ? `夹爪持有：${state.holding}` : '夹爪已张开';
  const running = state.phase === 'running';
  const start = () => { try { session.start(source); setError(''); sync(); } catch (e) { setError((e as Error).message); } };
  const stop = () => { session.stop(); sync(); };
  const reset = () => { session.reset(); setError(''); sync(); };
  const levels = farm?.levels || demos.filter(item => item.category === demo.category && item.simulation === demo.simulation && item.supported_modes.includes(mode));
  const levelPath = (item: ThirdDemo) => farm ? farm.path(item) : demoPath(item.category, mode, item.simulation, item.demo_id);
  const modeLabel = farm ? (mode === 'manual' ? '手动操作' : '编程控制') : modeLabels[mode];
  const programControls = farm ? [controls[0], controls[2], controls[1], controls[3], controls[4], controls[5]] : controls;
  const insertLoop = () => setSource(s => `${s}${s && !s.endsWith('\n') ? '\n' : ''}for i in range(2):\n    forward(${demo.simulation === 'grid' ? 1 : 12})`);
  const restoreSource = () => { setSource(demo.starter); setError(''); };
  const grid = session.engine.gridPresentation();
  const mapPosition = thirdMapPosition(state.x, state.z, demo.scene_config.depth);
  const continuous = demo.scene_config.kind === 'simulation3d' ? demo.scene_config : undefined;
  const insertCommand = (command: string) => setSource(current => `${current}${current.endsWith('\n') || !current ? '' : '\n'}${command}`);
  const selectedAction = (action: ThirdAction) => {
    const templates: Record<ThirdAction, string> = { forward: `forward(${demo.simulation === 'grid' ? 1 : 12})`, backward: `backward(${demo.simulation === 'grid' ? 1 : 12})`, turn_left: 'turn_left(90)', turn_right: 'turn_right(90)', grab: 'grab()', release: 'release()', wait: 'wait(1)' };
    insertCommand(templates[action]);
  };
  const oidButtons = continuous && <>
    <button disabled={running} title="move_to(x, y)：移动到车体中心坐标，单位厘米" onClick={() => insertCommand(`move_to(${Math.round(continuous.start.x)}, ${Math.round(Math.min(continuous.depth, continuous.depth - continuous.start.z + 12))})`)}><b>移动到点</b>{!farm && <code>move_to(x, y)</code>}</button>
    <button disabled={running} title="turn_to(角度)：转向绝对角度，0° 向上、90° 向右" onClick={() => insertCommand('turn_to(90)')}><b>转到角度</b>{!farm && <code>turn_to(角度)</code>}</button>
  </>;
  return <div className={`third-game-shell${farm ? ' farm-shell' : ''}`}><section className={`app future-city third-game third-workspace${farm ? ' farm-game' : ''}`} data-category={demo.category} data-mode={mode} data-simulation={demo.simulation}>
    <header className="app-header">
      <a className="brand" href={farm ? '/farm/' : '/demo/'} style={{ color: 'inherit', textDecoration: 'none' }} onClick={e => { e.preventDefault(); farm ? farm.onHome() : go('/demo/'); }}><div className="brand-mark">{farm ? '♧' : '✦'}</div><div><span>{farm ? '第三赛事 · 机器人挑战' : `DEMO 展示中心 · ${categoryLabels[demo.category]}`}</span><b>{farm ? '生态农场' : simulationLabels[demo.simulation]}</b></div></a>
      <div className="header-mode-controls">{farm ? <div className="current-mode farm-mode-notice" role="status" aria-label="本关操作方式" data-testid="farm-control-mode"><span>本关操作方式</span><strong>{modeLabel}</strong></div> : <div className="current-mode" aria-label="当前操作方式">{mode === 'auto' ? '</> 自动 · 程序操控' : '⌨ 手动 · 键盘操控'}</div>}</div>
      <div className="header-actions">{farm ? <><div className="farm-timer" aria-label="本轮用时"><span>本轮用时</span><output data-testid="farm-timer">{state.elapsed.toFixed(1)}<small> 秒</small></output></div><div className="player-info"><span className="online-dot" /><div><b>{farm.player.name}</b></div></div><button className="third-return" onClick={farm.onHome}>返回首页</button></> : <><button className="third-return" onClick={() => go(demoPath(demo.category, mode, demo.simulation))}>← DEMO 列表</button><button className="third-return" onClick={() => go(demoPath(demo.category))}>返回分类</button></>}</div>
    </header>
    <div className="app-body">
      <nav className="level-nav" aria-label="关卡导航">
        <div className="nav-heading"><span>任务地图</span><b>{levels.length} 关</b></div>
        <section className="stage-group"><div className="stage-label"><span>{farm ? '农场任务' : `${categoryLabels[demo.category]} · ${modeLabel}`}</span>{!farm && <small>{simulationLabels[demo.simulation]}</small>}</div>
          <div className="stage-levels">{levels.map((item, index) => <button key={item.demo_id} className={`level-btn${item.demo_id === demo.demo_id ? ' active' : ''}`} aria-current={item.demo_id === demo.demo_id ? 'page' : undefined} aria-label={`${index + 1} ${item.title}`} disabled={item.status === 'planned'} onClick={() => go(levelPath(item))}><span>{String(index + 1).padStart(2, '0')}</span>{farm && <strong>{item.title}</strong>}<small>{farm?.isCompleted(item) ? '✓ 完成' : `${item.scene_config.objects.length}点`}</small></button>)}</div>
        </section>
        {farm ? <details className="farm-nav-instructions" open><summary>操作提示</summary><ul>
          <li>{demo.category === 'collect' ? '接近资源自动收集。' : '物资完整进入同字母区域，停稳后完成。'}</li>
          <li>{mode === 'auto' ? '点击指令添加代码；循环内缩进 4 个空格。' : <>WASD / 方向键驾驶。{demo.category === 'place' && 'G 合拢夹爪，R 张开。'}</>}</li>
          <li>{mode === 'auto' && '距离用厘米，转向用度。'}每格 12 厘米。</li>
          {mode === 'auto' && <li>精准定位以车体中心为准，坐标填整数厘米；左下角 (0, 0)，0° 向上、90° 向右，速度减半。</li>}
          <li>拖动旋转，右键或“平移”按钮移动视角，滚轮缩放；“跟随小车”锁定焦点。</li>
        </ul></details> : <section className="stage-group"><div className="stage-label"><span>更多玩法</span></div><div className="stage-levels"><button className="level-btn" disabled aria-label="DEMO 准备中"><span>待更新</span></button></div></section>}
      </nav>
      <main className="game-area"><div className="workspace-grid robot-workspace">
        {!farm && <section className="mission-card"><div className="mission-number">{String(levels.findIndex(item => item.demo_id === demo.demo_id) + 1).padStart(2, '0')}</div><div className="mission-copy"><h1>{demo.title}</h1></div><span className="third-sample-status">{demo.status === 'sample' ? '功能验证样例' : '已开放 DEMO'}</span></section>}
        <section className="board-panel">
          {farm ? <div className="farm-mission-heading"><span className="farm-mission-number">{String(levels.indexOf(demo) + 1).padStart(2, '0')}</span><h1>{demo.title}</h1><p><span>任务目标</span><strong>{demo.objective}</strong></p></div>
            : <div className="panel-heading"><div><span>{demo.simulation === 'grid' ? '未来城市 · 棋盘模拟' : '智慧农场 · 3D 模拟'}</span><b>{demo.objective}</b><small className="board-rule-hint">{demo.simulation === 'grid' ? '按格移动；左右转向 90°。' : mode === 'auto' ? '按程序连续驾驶，距离单位为厘米。' : '连续驾驶；按住移动，松开减速。'}{demo.category === 'place' ? demo.simulation === 'simulation3d' ? mode === 'auto' ? 'grab() 合拢、release() 张开夹爪。' : '方块可推动；G 合拢、R 张开夹爪。' : '车头前方夹取或放下货物。' : '接近目标即可收集。'}</small></div><div className="legend robot-legend">{demo.category === 'collect' ? <span><i className="legend-patrol" />收集点</span> : <><span><i className="legend-cargo" />货物</span><span><i className="legend-dock" />交货点</span></>}</div></div>}
          {!farm && demo.simulation === 'simulation3d' && <div className="third-physical-scale" aria-label="场景尺寸"><span>地图 120 × 120 cm · 每格 12 cm</span><span>车体 19 × 19 · 夹爪 19 × 6 · 货块 6 × 6 cm</span></div>}
          <div className="third-stage" data-testid="third-stage" data-x={state.x.toFixed(4)} data-map-y={mapPosition.y.toFixed(4)} data-z={state.z.toFixed(4)} data-heading={state.heading.toFixed(4)} data-phase={state.phase} data-collected={state.collected.length} data-holding={state.holding || ''} data-gripper={state.gripper?.phase} data-objects={JSON.stringify(state.objects)}>
            {grid ? <CityBoard3D level={grid.level} state={grid.state} /> : <Suspense fallback={<p className="city3d-loading">正在加载三维场地…</p>}><SimulationScene demo={demo} state={state} onReady={onReady} /></Suspense>}
          </div>
          <div className="status-bar"><div><small>行动次数</small><b>{state.actions}</b></div><div><small>已完成目标</small><b data-testid="third-progress">{state.collected.length}<em> / {state.objects.length}</em></b></div><div className={`status-pill ${state.completed ? 'status-success' : ''}`}>{({ ready: '准备就绪', running: '运行中', stopped: '已停止', completed: '已完成' })[state.phase]}</div></div>
        </section>
        <aside className="control-column">
          {!farm && <section className="attempt-summary" aria-label="本关状态"><div className="attempt-summary-metrics"><div><span>当前模式</span><strong>{modeLabel}<small> · 试用</small></strong></div><div><span>本轮用时</span><strong>{state.elapsed.toFixed(1)}<small> 秒</small></strong></div></div><p>功能验证样例，暂不计正式比赛成绩。</p></section>}
          {mode === 'auto' ? <section className="python-editor robot-editor third-program-editor" aria-label="程序编辑器">
            <div className="editor-header"><h3>指令程序</h3>{farm && <span className="farm-editor-units">{running && state.line ? `第 ${state.line} 行` : '厘米 / 度'}</span>}<button className="robot-restart" title={farm ? '恢复本关示例代码，并重新开始本轮' : undefined} onClick={() => { reset(); if (farm) restoreSource(); }}>{farm ? '重置代码' : '重置'}</button></div>
            {!farm && <div className="code-line-metrics"><span>当前 <b>{source.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).length}</b> 行</span><span>{running && state.line ? `执行第 ${state.line} 行` : demo.simulation === 'grid' ? '距离：格' : '距离：厘米'}</span></div>}
            <div className="third-editor-fields">
            {continuous && !farm && <div className="third-command-tabs" role="tablist" aria-label="指令分类">
              <button role="tab" aria-selected={commandGroup === 'normal'} aria-controls="third-command-tools" onClick={() => setCommandGroup('normal')}>普通指令</button>
              <button role="tab" aria-selected={commandGroup === 'oid'} aria-controls="third-command-tools" onClick={() => setCommandGroup('oid')}>精准定位</button>
            </div>}
            <div className="third-command-tools" id="third-command-tools">
            {(!continuous || farm || commandGroup === 'normal') && <div className="robot-palette third-command-palette" aria-label="可用指令">{programControls.filter(([action]) => demo.category === 'place' || !['grab', 'release'].includes(action)).map(([action, , label]) => <button disabled={running} key={action} title={farm ? `插入 ${action} 指令` : undefined} onClick={() => selectedAction(action)}><b>{continuous && !farm && ['forward', 'backward'].includes(action) ? `${label}·距离` : actionLabel(action, label)}</b>{!farm && <code>{action}()</code>}</button>)}{continuous && !farm && ([['前进·时间', 'forward_time(1)'], ['后退·时间', 'backward_time(1)']] as const).map(([label, command]) => <button key={command} disabled={running} title={`插入 ${command}，单位秒`} onClick={() => insertCommand(command)}><b>{label}</b><code>{command}</code></button>)}{farm && oidButtons}<button disabled={running} title={farm ? '插入重复执行的循环' : undefined} onClick={insertLoop}><b>循环</b>{!farm && <code>for i in range(n)</code>}</button></div>}
            {farm && state.oid && <output className="farm-oid-status" data-testid="third-oid-target">{state.oid.phase === 'holding' ? '定位已到位' : '定位目标'}：({state.oid.x.toFixed(1)}, {state.oid.y.toFixed(1)}) cm · {((state.oid.heading * 180 / Math.PI % 360 + 360) % 360).toFixed(1)}°</output>}
            {continuous && !farm && commandGroup === 'oid' && <section className="third-oid-tools" aria-label="精准控制">
              <div className="mini-heading"><span>精准控制</span><small>普通速度的 50%</small></div>
              <div className="robot-palette third-command-palette">
                {oidButtons}
              </div>
              <p>左下角 (0, 0)，车体中心坐标用整数厘米。0° 向上、90° 向右；移动到点先转向再直行。</p>
              <small>普通 {continuous.speed} cm/s · 精准定位 {continuous.speed * THIRD_OID_SPEED_FACTOR} cm/s · 精准转向 {(continuous.turnSpeed * THIRD_OID_SPEED_FACTOR * 180 / Math.PI).toFixed(0)}°/s</small>
              {state.oid && <output data-testid="third-oid-target">{state.oid.phase === 'holding' ? '定位已到位' : '定位目标'}：({state.oid.x.toFixed(1)}, {state.oid.y.toFixed(1)}) cm · {((state.oid.heading * 180 / Math.PI % 360 + 360) % 360).toFixed(1)}°</output>}
            </section>}
            </div>
            {!farm && <label className="robot-editor-target" htmlFor="third-program">{demo.simulation === 'grid' ? '前进、后退按格填写，转向为 90° 的倍数' : '普通：厘米 / 秒；精准定位：绝对坐标（厘米）/ 朝向（度）'}</label>}
            <textarea id="third-program" className="third-program-source" aria-label="指令程序" spellCheck={false} autoComplete="off" value={source} disabled={running} maxLength={8000} onChange={e => setSource(e.target.value)} onKeyDown={e => {
              if (e.key === 'Tab') { e.preventDefault(); const field = e.currentTarget, start = field.selectionStart, end = field.selectionEnd;
                setSource(source.slice(0, start) + '    ' + source.slice(end)); requestAnimationFrame(() => field.setSelectionRange(start + 4, start + 4)); }
            }} />
            {(!farm || storageNotice) && <div className="third-source-tools">{!farm && <button className="robot-restart" disabled={running} onClick={restoreSource}>恢复示例程序</button>}<small role={storageNotice ? 'status' : undefined}>{storageNotice || '草稿已保存在本浏览器'}</small></div>}
            {error && <p className="editor-error" role="alert">{error}</p>}
            </div><div className="third-program-actions"><button className="run-btn" disabled={running || !ready} onClick={start} data-testid="third-start">{running ? '正在执行…' : '▶ 运行程序'}</button>
            <button className="secondary-action third-stop" disabled={!running} onClick={stop}>停止</button></div>
          </section> : <section className="keyboard-card">
            <div className="mini-heading"><span>{demo.category === 'place' ? '驾驶与夹爪' : '方向控制'}</span><small>相对车头方向</small></div>
            <div className="robot-controls">{controls.filter(([action]) => demo.category === 'place' || !['grab', 'release'].includes(action)).map(([action, key, label]) => <button key={action} disabled={!running} aria-label={`${actionLabel(action, label)} ${key}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); pointerActions.current.add(action); session.press(action); sync(); }}
              onPointerUp={() => { session.release(action); pointerActions.current.delete(action); sync(); }} onPointerCancel={() => { session.release(action); pointerActions.current.delete(action); }}
              onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); if (!e.repeat) { session.press(action); sync(); } } }} onKeyUp={e => { if (['Enter', ' '].includes(e.key)) { session.release(action); sync(); } }}><kbd>{key.split(' / ')[0]}</kbd><span>{actionLabel(action, label)}{demo.simulation === 'grid' && ['forward', 'backward'].includes(action) ? '一格' : demo.simulation === 'grid' && action.startsWith('turn') ? ' 90°' : ''}</span></button>)}</div>
            {(!farm || demo.category === 'place') && <p className="robot-holding">{gripText}{!farm && state.gripper && <small> · 开口 {state.gripper.gap.toFixed(1)} cm</small>}</p>}<p className="third-key-help">{demo.simulation === 'grid' ? '按一下走一格，也可点击方向按钮。' : farm ? '按住方向键连续驾驶，松开减速。' : '按住方向键连续驾驶，松开减速。货块可能滑动或转动。'}</p>
            <button className="primary-action" disabled={running || !ready} onClick={start} data-testid="third-start">▶ 开始控制</button><div className="third-manual-actions"><button className="secondary-action" disabled={!running} onClick={stop}>停止</button><button className="secondary-action" onClick={reset}>重置</button></div>
          </section>}
          {(!farm || state.phase === 'stopped' || state.completed) && <div className={`message${state.completed ? ' success' : ''}`} role="status">{farm && state.completed ? '任务完成！' : state.message}</div>}
          {farm && state.completed && <div className="farm-completion-actions"><button className="primary-action" onClick={reset}>再挑战一次</button>{levels[levels.indexOf(demo) + 1] && <button className="secondary-action" onClick={() => go(levelPath(levels[levels.indexOf(demo) + 1]))}>下一任务 →</button>}</div>}
          {!farm && <details className="third-instructions"><summary>玩法说明与指令</summary><p>{demo.category === 'collect' ? '接近资源即可收集，同一目标仅收集一次。' : demo.simulation === 'simulation3d' ? '货块可直接推动或双侧夹持搬运；完整进入同字母方框并停稳才计入目标。离开目标区会取消该块的到位状态。' : '面向前方货物夹取，放入同字母目标区完成任务。'}</p><p>forward(n)、backward(n)、turn_left(角度)、turn_right(角度)、wait(秒){demo.category === 'place' ? '、grab()、release()' : ''}。循环体缩进 4 个空格。</p>{continuous && <p>3D 编程还支持 forward_time(秒)、backward_time(秒)、move_to(x, y)、turn_to(绝对角度)。精准定位的直行和转向均为对应普通速度的 50%，精确定位车体中心；遇到障碍停止，不会自动绕行。</p>}<p>每轮最长 120 秒，最多 256 条展开指令。{demo.category === 'place' && demo.simulation === 'simulation3d' ? 'grab() 合拢夹爪，release() 张开夹爪；没有对准也会空夹，货块不会自动吸附。' : ''}</p></details>}
        </aside>
      </div></main>
    </div>
    <footer><span>{farm ? '生态农场 · 机器人挑战' : `DEMO 展示中心 · ${categoryLabels[demo.category]} · ${modeLabel}`}</span><span role={farm?.storageNotice ? 'status' : undefined}>{farm ? farm.storageNotice || '进度与草稿保存在本浏览器 · 暂不计正式成绩' : `${demo.simulation === 'grid' ? '棋盘模拟：按格移动' : '3D 模拟：连续运动'} · 本地试用`}</span></footer>
  </section></div>;
}
