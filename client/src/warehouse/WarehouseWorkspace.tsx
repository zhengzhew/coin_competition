import { useCallback, useEffect, useRef, useState } from 'react';
import { WarehouseSession, warehouseLevels, thirdMapPosition, type ThirdAction, type WarehouseLevel } from '@coin-path/shared';
import { CompetitionHeader, CompetitionMission } from '../components/CompetitionTemplate';
import { CompetitionResult, RunSummary } from '../components/CompetitionResult';
import { LevelMetrics } from '../components/Leaderboard';
import { useLeaderboardSubmission } from '../components/useLeaderboardSubmission';
import { competitionModules } from '../competition-modules';
import SimulationScene from '../third/simulation3d/SimulationScene';
import { warehousePath } from './WarehouseApp';
import type { WarehousePlayer, WarehouseRecord } from './storage';

const controls = [['forward', 'W / ↑', '前进'], ['turn_left', 'A / ←', '左转'], ['backward', 'S / ↓', '后退'],
  ['turn_right', 'D / →', '右转'], ['grab', 'G', '闭合夹爪'], ['release', 'R', '张开夹爪']] as const;
const keys: Record<string, ThirdAction> = { w: 'forward', arrowup: 'forward', s: 'backward', arrowdown: 'backward',
  a: 'turn_left', arrowleft: 'turn_left', d: 'turn_right', arrowright: 'turn_right', g: 'grab', r: 'release' };
interface Props {
  level: WarehouseLevel; player: WarehousePlayer; records: WarehouseRecord[]; notice: string;
  go: (path: string) => void; onComplete: (level: WarehouseLevel, seconds: number) => void;
}
export default function WarehouseWorkspace({ level, player, records, notice, go, onComplete }: Props) {
  const [session] = useState(() => new WarehouseSession(level));
  const [state, setState] = useState(() => session.snapshot());
  const [ready, setReady] = useState(false);
  const recorded = useRef(false);
  const sync = useCallback(() => setState(session.snapshot()), [session]);
  const onReady = useCallback((value: boolean) => {
    setReady(value);
    if (!value) { session.stop('三维画面中断，本轮未完成。重新加载后可再次挑战。'); sync(); }
  }, [session, sync]);
  useEffect(() => {
    let frame = 0, last = performance.now();
    const animate = (now: number) => {
      const wasRunning = session.phase === 'running';
      session.tick((now - last) / 1000); last = now;
      if (wasRunning) sync();
      frame = requestAnimationFrame(animate);
    };
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]');
    const down = (e: KeyboardEvent) => {
      const action = keys[e.key.toLowerCase()];
      if (!action || editable(e.target) || e.ctrlKey || e.altKey || e.metaKey || session.phase !== 'running') return;
      e.preventDefault(); if (!e.repeat) { session.press(`key:${e.key.toLowerCase()}`, action); sync(); }
    };
    const up = (e: KeyboardEvent) => { session.release(`key:${e.key.toLowerCase()}`); sync(); };
    const pointerUp = (e: PointerEvent) => { session.release(`pointer:${e.pointerId}`); sync(); };
    const clear = () => { session.clearInputs(); sync(); };
    const focus = (e: FocusEvent) => { if (editable(e.target)) clear(); };
    const visibility = () => { if (document.hidden) clear(); };
    frame = requestAnimationFrame(animate);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    return () => {
      cancelAnimationFrame(frame); session.stop();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear);
      window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerUp);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus);
    };
  }, [session, sync]);
  useEffect(() => {
    if (state.completed && !recorded.current) { recorded.current = true; onComplete(level, state.elapsed); }
  }, [state.completed, state.elapsed, level, onComplete]);
  const reset = () => { session.reset(); recorded.current = false; sync(); };
  const start = () => { recorded.current = false; session.start(); sync(); };
  const running = state.phase === 'running', index = warehouseLevels.indexOf(level);
  const times = records.filter(r => r.levelId === level.demo_id);
  const best = times.length ? Math.min(...times.map(r => r.seconds)) : null;
  const submission = useLeaderboardSubmission('warehouse', level, player, 'manual', '', state);
  const position = thirdMapPosition(state.x, state.z, 120);
  const grip = state.completed ? '箱子已送达 · 任务完成' : state.holding ? `已夹稳箱子 ${state.holding}` : ({
    open: '夹爪张开 · 对准后按 G', opening: '正在放下箱子', closing: '正在合拢夹爪',
    closed: '空夹 · 按 R 重新张开', blocked: '夹取受阻 · 调整位置再试', holding: '已夹稳',
  })[state.gripper?.phase ?? 'open'];
  return <div className="third-game-shell warehouse-shell"><section className="app future-city third-game third-workspace warehouse-game competition-template" data-module="warehouse" data-mode="manual" data-simulation="simulation3d">
    <CompetitionHeader module={competitionModules.warehouse} onHome={() => go(warehousePath())} player={player} mode="按键操控"
      timer={<div className="warehouse-header-timer"><span>本轮用时</span><output data-testid="warehouse-timer">{state.elapsed.toFixed(2)}<small> 秒</small></output></div>} />
    <div className="app-body">
      <nav className="level-nav" aria-label="仓储关卡"><div className="nav-heading"><span>搬运任务</span><b>6 关</b></div><div className="stage-levels">
        {warehouseLevels.map((l, i) => <button key={l.demo_id} className={`level-btn${level === l ? ' active' : ''}`} aria-current={level === l ? 'page' : undefined} onClick={() => go(warehousePath(l))}>
          <span>0{i + 1}</span><strong>{l.title}</strong><small>{records.some(r => r.levelId === l.demo_id) ? '✓' : `${l.requiredCount} 箱 / ${l.scene_config.zones.length} 格`}</small></button>)}
        </div><details className="warehouse-instructions" open><summary>摆放规则</summary><ul><li>G 夹取，R 放下。</li><li>一箱一格，每个箱子可选择任一空投递区。</li><li>允许旋转、轻微压线，不能越过边线外沿。</li><li>箱子不重叠、不叠放，停稳 0.4 秒确认。</li><li>同格放入多个箱子时，该格暂不计入送达；移出后重新判定。</li><li>全部箱子有效送达即停表，只记录完成用时。</li></ul><p>不设时间上限。松键、切换视角或窗口失焦均不停表。</p><p>成功完成后提交排行榜，按完成用时排名。</p></details>
      </nav>
      <main className="game-area">
        <div className="workspace-grid robot-workspace">
          <section className="board-panel"><CompetitionMission number={index + 1} title={level.title} objective={level.objective} /><div className="warehouse-map-caption"><span>120 × 120 cm · 投递格 12 cm · 箱子 6 cm</span><span>一箱一格 · 自选空格</span></div>
            <div className="third-stage warehouse-stage" data-testid="warehouse-stage" data-phase={state.phase} data-x={state.x.toFixed(3)}
              data-y={position.y.toFixed(3)} data-heading={state.heading} data-holding={state.holding ?? ''}
              data-delivered={state.collected.length} data-objects={JSON.stringify(state.objects)}>
              <SimulationScene demo={level} state={state} onReady={onReady} />
            </div>
            <div className="warehouse-zone-legend">{level.scene_config.zones.map(z => <span key={z.id}><i style={{ background: z.color }} />{z.id} 投递区</span>)}</div>
          </section>
          <aside className="control-column">
            <section className="warehouse-card"><div className="warehouse-card-heading"><h2>驾驶控制</h2><small>按住行驶 · 松开制动</small></div>
              <div className="warehouse-keypad">{controls.map(([action, key, label]) => <button key={action} className={`warehouse-key-${action}`} disabled={!running} aria-label={`${label} ${key}`}
                onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); session.press(`pointer:${e.pointerId}`, action); sync(); }}
                onLostPointerCapture={e => { session.release(`pointer:${e.pointerId}`); sync(); }}
                onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); session.press(`button:${action}`, action); sync(); } }}
                onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); session.release(`button:${action}`); sync(); } }}
                onBlur={() => { session.release(`button:${action}`); sync(); }}><kbd>{key}</kbd><span>{label}</span></button>)}</div>
              <p className="warehouse-grip" data-testid="warehouse-grip">{grip}</p>
              <button className="warehouse-primary" data-testid="warehouse-start" disabled={!ready || running || state.completed} onClick={start}>{!ready ? '正在准备场景…' : running ? '搬运进行中' : state.completed ? '任务已完成' : '开始计时'}</button>
              <div className="warehouse-actions"><button disabled={!running} onClick={() => { session.stop(); sync(); }}>结束本轮</button><button onClick={reset}>重新开始</button></div>
            </section>
            {state.completed ? <CompetitionResult score={submission.score} seconds={state.elapsed} failed={submission.failed} scoreTestId="warehouse-result-time" onReset={reset}
              onNext={warehouseLevels[index + 1] ? () => go(warehousePath(warehouseLevels[index + 1])) : undefined} />
              : <p className="warehouse-message" role="status">{state.message}</p>}
            <section className="warehouse-card warehouse-cargo-list"><h2>货物状态</h2>{state.objects.map(o => <div key={o.id}><b>箱子 {o.id}</b><span>{state.delivered[o.id] ? `✓ ${state.delivered[o.id]} 区已送达` : state.holding === o.id ? '夹取中' : '待投递'}</span></div>)}</section>
          </aside>
        </div>
      </main>
    </div>
    <footer><RunSummary><div><small>有效送达</small><b data-testid="warehouse-progress">{state.collected.length}<em> / {level.requiredCount} 箱</em></b></div><div><small>个人最快</small><b>{best?.toFixed(2) ?? '—'}{best !== null && <em> 秒</em>}</b></div><div className={`status-pill ${state.completed ? 'status-success' : ''}`}>{({ ready: '准备出发', running: '搬运进行中', stopped: '本轮已停止', completed: '全部送达' })[state.phase]}</div></RunSummary>
      <LevelMetrics steps={0} lines={0} seconds={state.elapsed} scope={{ competition: 'warehouse', level: level.demo_id, mode: 'manual', version: level.content_version }}>
        <small role="status">{submission.notice || notice}</small>{submission.failed && <button onClick={submission.retry}>重试提交</button>}
      </LevelMetrics></footer>
  </section></div>;
}
