import { useCallback, useEffect, useRef, useState } from 'react';
import { BeachSession, beachLevels, thirdMapPosition, type ThirdAction, type ThirdDemo } from '@coin-path/shared';
import { CompetitionHeader, CompetitionMission } from '../components/CompetitionTemplate';
import { competitionModules } from '../competition-modules';
import SimulationScene from '../third/simulation3d/SimulationScene';

const path = (demo?: ThirdDemo) => demo ? `/beach/${demo.demo_id}/` : '/beach/';
const controls = [['forward', 'W / ↑', '前进'], ['turn_left', 'A / ←', '左转'], ['backward', 'S / ↓', '后退'], ['turn_right', 'D / →', '右转'], ['grab', 'G', '夹取贝壳'], ['release', 'R', '放下贝壳']] as const;
const keyActions: Record<string, ThirdAction> = { w: 'forward', arrowup: 'forward', s: 'backward', arrowdown: 'backward', a: 'turn_left', arrowleft: 'turn_left', d: 'turn_right', arrowright: 'turn_right', g: 'grab', r: 'release' };
interface Props {
  demo: ThirdDemo; player: { id: string; name: string }; go: (path: string) => void; bests: Record<string, number>;
  onComplete: (demo: ThirdDemo, seconds: number) => void; storageNotice: string;
}
export default function BeachWorkspace({ demo, player, go, bests, onComplete, storageNotice }: Props) {
  const [session] = useState(() => new BeachSession(demo));
  const [state, setState] = useState(() => session.snapshot());
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state); stateRef.current = state;
  const sync = useCallback(() => setState(session.snapshot()), [session]);
  const onReady = useCallback((value: boolean) => { setReady(value); if (!value) { session.stop('画面中断，本轮已停止，请重新开始。'); sync(); } }, [session, sync]);
  useEffect(() => {
    let frame = 0, last = performance.now();
    const animate = (now: number) => {
      session.tick((now - last) / 1000); last = now;
      if (session.phase === 'running' || stateRef.current.phase !== session.phase) sync();
      frame = requestAnimationFrame(animate);
    };
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"]');
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(), action = keyActions[key];
      if (!action || event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || session.phase !== 'running') return;
      event.preventDefault(); if (event.repeat) return; session.press(`key:${key}`, action); sync();
    };
    const up = (event: KeyboardEvent) => { session.release(`key:${event.key.toLowerCase()}`); sync(); };
    const pointerUp = (event: PointerEvent) => { session.release(`pointer:${event.pointerId}`); sync(); };
    const stop = () => { session.stop('已离开操作页面，本轮停止。重新开始将从起点计时。'); sync(); };
    const visibility = () => { if (document.hidden) stop(); };
    const focus = (event: FocusEvent) => { if (editable(event.target)) stop(); };
    frame = requestAnimationFrame(animate);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', stop);
    window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    return () => { cancelAnimationFrame(frame); session.stop(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop);
      window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerUp); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus); };
  }, [session, sync]);
  useEffect(() => { if (state.completed) onComplete(demo, state.elapsed); }, [state.completed, state.elapsed, onComplete, demo]);
  const running = state.phase === 'running', index = beachLevels.indexOf(demo), best = bests[`${demo.demo_id}.${demo.content_version}`];
  const reset = () => { session.reset(); sync(); };
  const start = () => { session.start(); sync(); };
  const position = thirdMapPosition(state.x, state.z, demo.scene_config.depth);
  const gripText = state.completed ? '贝壳已全部送达岸边' : state.holding ? `已夹稳贝壳 ${state.holding}` : ({ open: '夹爪已张开', opening: '正在放下', closing: '正在夹取', closed: '空夹 · 按 R 张开', holding: '已夹稳', blocked: '夹爪受阻 · 重新对准' })[state.gripper?.phase ?? 'open'];
  return <div className="third-game-shell beach-shell"><section className="app future-city third-game third-workspace beach-game competition-template" data-module="beach" data-mode="manual" data-simulation="simulation3d">
    <CompetitionHeader module={competitionModules.beach} onHome={() => go(path())} mode="手动 · 键盘驾驶" modeLabel="本关操作方式" player={player}
      timer={<div className="beach-timer"><span>本轮用时</span><output data-testid="beach-timer">{state.elapsed.toFixed(2)}<small> 秒</small></output></div>} />
    <div className="app-body"><nav className="level-nav" aria-label="关卡导航"><div className="nav-heading"><span>拾贝地图</span><b>2 关</b></div><div className="stage-levels">{beachLevels.map((item, i) => <button key={item.demo_id} className={`level-btn${item === demo ? ' active' : ''}`} aria-label={`${i + 1} ${item.title}`} aria-current={item === demo ? 'page' : undefined} onClick={() => go(path(item))}><span>0{i + 1}</span><strong>{item.title}</strong><small>{bests[`${item.demo_id}.${item.content_version}`] ? '✓' : `${item.scene_config.objects.length} 枚`}</small></button>)}</div>
      <details className="beach-instructions" open><summary>拾贝指南</summary><ol><li>车头对准贝壳，让它进入两侧夹爪之间。</li><li>按 G 夹取，慢慢送往浅蓝色边缘带。</li><li>按 R 放下，贝壳完整进入边缘带并停稳后交付。</li></ol><p>每次夹取一枚。已交付贝壳留在岸边。</p></details>
      <details className="beach-instructions"><summary>计时与得分</summary><p>点击开始即计时，全部交付后结束。停止或离开页面会结束本轮，重新开始从零计时。</p><p>得分 = 10000 ÷ (100 + 用时秒数)，保留两位小数。未完成不计分；同分比较原始用时。</p></details>
      <div className="beach-nav-art" aria-hidden="true"><img src="/assets/beach/shell.svg" alt="" /><span>每一枚贝壳，<br />都有自己的归途。</span></div>
    </nav><main className="game-area"><div className="workspace-grid robot-workspace">
      <section className="board-panel"><CompetitionMission number={index + 1} title={demo.title} objective={demo.objective} />
        <div className="beach-map-caption"><span><i /> 浅蓝色：岸边交付区</span><span>OID · 120 × 120 cm</span></div>
        <div className="third-stage" data-testid="beach-stage" data-phase={state.phase} data-x={state.x.toFixed(4)} data-map-y={position.y.toFixed(4)} data-heading={state.heading} data-holding={state.holding || ''} data-collected={state.collected.length} data-objects={JSON.stringify(state.objects)}>
          <SimulationScene demo={demo} state={state} onReady={onReady} />
        </div><div className="status-bar"><div><small>已送达岸边</small><b data-testid="beach-progress">{state.collected.length}<em> / {state.objects.length} 枚</em></b></div><div><small>个人最快</small><b data-testid="beach-best">{best?.toFixed(2) ?? '—'}{best !== undefined && <em> 秒</em>}</b></div><div className={`status-pill ${state.completed ? 'status-success' : ''}`}>{({ ready: '准备出发', running: '拾贝进行中', stopped: '本轮已停止', completed: '全部送达' })[state.phase]}</div></div>
      </section>
      <aside className="control-column"><section className="beach-control-card" aria-label="驾驶控制"><div className="beach-card-heading"><h2>驾驶小车</h2><span>按住行驶 · 松开停下</span></div>
        <div className="beach-keypad">{controls.map(([action, key, label]) => <button key={action} className={`beach-key-${action}`} aria-label={`${label} ${key}`} disabled={!running}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); session.press(`pointer:${event.pointerId}`, action); sync(); }}
          onPointerUp={event => { session.release(`pointer:${event.pointerId}`); sync(); }} onPointerCancel={event => { session.release(`pointer:${event.pointerId}`); sync(); }}
          onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); session.press(`button:${action}`, action); sync(); } }}
          onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); session.release(`button:${action}`); sync(); } }}
          onBlur={() => { session.release(`button:${action}`); sync(); }}><kbd>{key}</kbd><span>{label}</span></button>)}</div>
        <div className={`beach-grip${state.holding ? ' holding' : ''}`} data-testid="beach-grip">{gripText}</div>
        <button className="beach-start" disabled={running || !ready} onClick={start} data-testid="beach-start">{running ? '拾贝进行中…' : state.phase === 'ready' ? '▶ 开始计时' : '▶ 重新开始计时'}</button>
        <div className="beach-actions"><button disabled={!running} onClick={() => { session.stop(); sync(); }}>停止</button><button onClick={reset}>重置</button></div>
      </section>
      <section className="beach-shell-list" aria-label="贝壳坐标"><div className="beach-card-heading"><h2>沙滩上的贝壳</h2><span>OID 初始坐标</span></div>{demo.scene_config.objects.map(obj => <div key={obj.id}><b>{obj.id}</b><span>({obj.x}, {demo.scene_config.depth - obj.z})</span><small>{state.collected.includes(obj.id) ? '✓ 已送达' : state.holding === obj.id ? '夹取中' : '待拾取'}</small></div>)}</section>
      {state.completed ? <section className="beach-result" aria-label="本轮成绩" role="status"><span>海风为你喝彩 · 全部送达</span><strong data-testid="beach-score">{state.score.toFixed(2)}<small> 分</small></strong><p>本轮用时 {state.elapsed.toFixed(2)} 秒</p><div className="beach-actions"><button onClick={reset}>再挑战一次</button>{beachLevels[index + 1] && <button onClick={() => go(path(beachLevels[index + 1]))}>下一关 →</button>}</div></section>
        : <div className="beach-message" role="status">{state.message}</div>}
      </aside>
    </div></main></div><footer><span>潮汐拾光 · 海边拾贝</span><span role={storageNotice ? 'status' : undefined}>{storageNotice || '个人最快记录保存在本浏览器 · 本地评分'}</span></footer>
  </section></div>;
}
