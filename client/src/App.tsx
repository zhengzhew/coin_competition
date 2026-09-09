import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGameState, createUuid, generateInitialRows, generatePythonSource, step, validateAndExpand,
  type Direction, type GameState, type GameStatus, type LevelDef, type Mode,
  type ScoreResult, type TemplateRow,
} from '@coin-path/shared';
import GameBoard from './components/GameBoard';
import LevelNav from './components/LevelNav';
import PythonEditor from './components/PythonEditor';
import { TelemetryClient } from './telemetry';
import './App.css';

interface Player {
  player_uuid: string;
  display_name: string;
  language_experience?: 'python' | 'cpp' | 'both' | 'none' | null;
}

interface AttemptInfo { attempt_id: string; trial_index: number; assignment_key: string; }
interface ServerResult {
  status: GameStatus; steps: number; collisions: number; collected_order: string[];
  score: ScoreResult; is_terminal?: boolean; verified?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [currentLevel, setCurrentLevel] = useState<LevelDef | null>(null);
  const [mode, setMode] = useState<Mode>('keyboard');
  const [modeSelected, setModeSelected] = useState(false);
  const [litDirection, setLitDirection] = useState<Direction | null>(null);
  const lightTimer = useRef<number | null>(null);
  useEffect(() => () => { if (lightTimer.current !== null) window.clearTimeout(lightTimer.current); }, []);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [animating, setAnimating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ remaining_attempts: number; final_score: number | null } | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    if (!player || !currentLevel) return;
    let cancelled = false;
    setProgress(null);
    const key = mode === 'keyboard' ? currentLevel.keyboard_id : currentLevel.python_id;
    void fetch(`/api/assignments/${key}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!cancelled) setProgress(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [player, currentLevel, mode, attempt, score, gameState?.status]);

  const levelRef = useRef<LevelDef | null>(null);
  const modeRef = useRef<Mode>('keyboard');
  const attemptRef = useRef<AttemptInfo | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const telemetryRef = useRef<TelemetryClient | null>(null);
  const commandChain = useRef<Promise<void>>(Promise.resolve());
  const levelEntryRef = useRef<{ entered_at: string; mono: number; reason: string } | null>(null);

  const markLevelEntry = (reason: string) => {
    levelEntryRef.current = { entered_at: new Date().toISOString(), mono: performance.now(), reason };
  };

  const commitGame = (state: GameState) => {
    gameRef.current = state;
    setGameState({ ...state });
  };

  const selectLevel = useCallback((level: LevelDef) => {
    markLevelEntry('level_selected');
    levelRef.current = level;
    setCurrentLevel(level);
    commitGame(createGameState(level));
    setRows(generateInitialRows(level.python));
    setAttempt(null); attemptRef.current = null;
    setScore(null); setMessage(null); setEditorError(null);
    telemetryRef.current?.track('level_selected', `nav.level.${level.level_id}`, { level_id: level.level_id, coin_count: level.coins.length });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/players/bootstrap', { method: 'POST', credentials: 'include' }).then(async (response) => {
        if (!response.ok) throw new Error('无法建立玩家身份');
        return response.json() as Promise<Player>;
      }),
      fetch('/api/levels').then(async (response) => {
        if (!response.ok) throw new Error('无法读取关卡');
        return response.json() as Promise<LevelDef[]>;
      }),
    ]).then(([nextPlayer, nextLevels]) => {
      if (cancelled) return;
      setPlayer(nextPlayer);
      setLevels(nextLevels);
      if (nextLevels.length) selectLevel(nextLevels[0]);
    }).catch((error) => !cancelled && setLoadingError(error instanceof Error ? error.message : '加载失败'));
    return () => { cancelled = true; };
  }, [selectLevel]);

  useEffect(() => {
    if (!player) return;
    const telemetry = new TelemetryClient({
      playerUuid: player.player_uuid,
      assignmentKey: () => {
        const level = levelRef.current;
        return level ? (modeRef.current === 'keyboard' ? level.keyboard_id : level.python_id) : null;
      },
      levelId: () => levelRef.current?.level_id ?? null,
      mode: () => modeRef.current,
      attemptId: () => attemptRef.current?.attempt_id ?? null,
    });
    telemetryRef.current = telemetry;
    void telemetry.start().catch(() => setMessage('埋点服务暂时离线，操作会先保存在本机。'));
    return () => telemetry.stop();
  }, [player?.player_uuid]);

  const stopRemoteAttempt = (current = attemptRef.current) => {
    if (!current || current.attempt_id.startsWith('local-')) return;
    void fetch(`/api/attempts/${current.attempt_id}/stop`, { method: 'POST', credentials: 'include' });
  };

  const resetGame = useCallback((stopRemote = true) => {
    const level = levelRef.current;
    if (!level) return;
    markLevelEntry('retry');
    if (stopRemote && attemptRef.current && gameRef.current?.status === 'running') stopRemoteAttempt();
    attemptRef.current = null; setAttempt(null);
    commitGame(createGameState(level));
    setScore(null); setMessage(null); setEditorError(null);
    setRows(generateInitialRows(level.python));
    commandChain.current = Promise.resolve();
    telemetryRef.current?.track('attempt_reset', 'attempt.reset', {});
  }, []);

  const chooseMode = (nextMode: Mode) => {
    modeRef.current = nextMode; setMode(nextMode);
    setModeSelected(true);
    markLevelEntry('onboarding_completed');
    telemetryRef.current?.track('mode_selected', `onboarding.mode.${nextMode}`, { mode: nextMode });
  };

  const beginAttempt = async (preserveProgram: boolean): Promise<AttemptInfo | null> => {
    const level = levelRef.current;
    if (!level || startingRef.current) return null;
    startingRef.current = true;
    // Capture the click before the request so server latency is excluded.
    const entry = levelEntryRef.current;
    const preparation = modeRef.current === 'keyboard' && entry ? {
      level_entered_at: entry.entered_at,
      start_clicked_at: new Date().toISOString(),
      entry_to_start_ms: Math.max(0, Math.round(performance.now() - entry.mono)),
      entry_reason: entry.reason,
      preparation_id: createUuid(),
    } : null;
    if (preparation) telemetryRef.current?.track('level_start_clicked', 'attempt.start', preparation);
    if (attemptRef.current && gameRef.current?.status === 'running') stopRemoteAttempt();
    commitGame(createGameState(level));
    setScore(null); setMessage(null); setEditorError(null);
    if (!preserveProgram) setRows(generateInitialRows(level.python));
    const assignmentKey = modeRef.current === 'keyboard' ? level.keyboard_id : level.python_id;
    try {
      const response = await fetch('/api/attempts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_key: assignmentKey }),
      });
      const body = await response.json();
      if (response.status === 409 && body.code === 'ATTEMPT_LIMIT_REACHED') {
        const next = { attempt_id: `local-${createUuid()}`, trial_index: 0, assignment_key: assignmentKey };
        attemptRef.current = next; setAttempt(next);
        setMessage('3 次正式尝试已用完，当前为练习模式，不计算成绩。');
        return next;
      }
      if (!response.ok) throw new Error(body.error || '无法开始本轮');
      const next = body as AttemptInfo;
      attemptRef.current = next; setAttempt(next);
      telemetryRef.current?.track('attempt_started', 'attempt.start', { assignment_key: assignmentKey, trial_index: next.trial_index, ...preparation });
      return next;
    } catch (error) {
      attemptRef.current = null; setAttempt(null);
      setMessage(error instanceof Error ? `${error.message}；请检查连接后重试。` : '无法开始，请稍后重试。');
      return null;
    } finally {
      startingRef.current = false;
    }
  };

  const applyLocalCommand = (direction: Direction, source: Mode) => {
    const level = levelRef.current;
    const state = gameRef.current;
    if (!level || !state || state.status !== 'running') return null;
    const commandIndex = state.consumed_commands + 1;
    telemetryRef.current?.track('command_issued', `move.${direction}`, { direction, source, command_index: commandIndex });
    const result = step(state, {
      direction, command_index: commandIndex, command_id: createUuid(), source,
    }, level.required_order, level.coins.length, level.max_commands, level.step_limit);
    commitGame(result.state);
    telemetryRef.current?.track(result.event.type, 'game.board', { ...result.event });
    if (result.event.type === 'order_violation') {
      setMessage('这枚金币还没轮到，已保留在地图上；请先拾取当前编号。');
    } else if (result.event.type === 'coin_collected') {
      setMessage(null);
    }
    return result.state;
  };

  const acceptServerResult = (result: ServerResult) => {
    setScore(result.score);
    setMessage(null);
    const current = gameRef.current;
    if (current && result.status !== 'running') commitGame({ ...current, status: result.status });
    telemetryRef.current?.track('attempt_verified', 'attempt.result', {
      status: result.status, score: result.score.total_score, steps: result.steps,
      collisions: result.collisions, collected_order: result.collected_order,
    });
  };

  const sendCommands = async (currentAttempt: AttemptInfo, commands: Direction[], programSnapshot?: string) => {
    if (currentAttempt.attempt_id.startsWith('local-')) return null;
    const response = await fetch(`/api/attempts/${currentAttempt.attempt_id}/commands`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, program_snapshot: programSnapshot }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '指令提交失败');
    return body as ServerResult;
  };

  const executeKeyboard = useCallback((direction: Direction) => {
    const currentAttempt = attemptRef.current;
    if (!currentAttempt || modeRef.current !== 'keyboard' || gameRef.current?.status !== 'running') return;
    setLitDirection(direction);
    if (lightTimer.current !== null) window.clearTimeout(lightTimer.current);
    lightTimer.current = window.setTimeout(() => setLitDirection(null), 180);
    const nextState = applyLocalCommand(direction, 'keyboard');
    commandChain.current = commandChain.current.then(async () => {
      try {
        const server = await sendCommands(currentAttempt, [direction]);
        if (server?.is_terminal) acceptServerResult(server);
      } catch (error) { setMessage(error instanceof Error ? error.message : '指令提交失败'); }
    });
    if (nextState?.status !== 'running') {
      setMessage(currentAttempt.attempt_id.startsWith('local-')
        ? '本机练习已完成，本次不记录正式成绩。'
        : '路线已结束，正在核验成绩…');
    }
  }, []);

  useEffect(() => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', a: 'left', s: 'down', d: 'right', W: 'up', A: 'left', S: 'down', D: 'right',
    };
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || modeRef.current !== 'keyboard') return;
      const direction = keyMap[event.key];
      if (!direction) return;
      event.preventDefault();
      executeKeyboard(direction);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [executeKeyboard]);

  const runPython = async () => {
    const level = levelRef.current;
    if (!level || animating) return;
    const validation = validateAndExpand(rows, level.python);
    if (!validation.valid || !validation.expanded) {
      setEditorError(validation.errors.join('；'));
      telemetryRef.current?.track('program_validation_failed', 'python.run', { errors: validation.errors });
      return;
    }
    setEditorError(null);
    const currentAttempt = await beginAttempt(true);
    if (!currentAttempt) return;
    const programSnapshot = generatePythonSource(rows, level.python);
    telemetryRef.current?.track('program_run_started', 'python.run', { program_snapshot: programSnapshot, expanded_steps: validation.expanded.length });
    setAnimating(true);
    for (const direction of validation.expanded) {
      await sleep(95);
      const state = applyLocalCommand(direction, 'python_blank');
      if (state?.status !== 'running') break;
    }
    setAnimating(false);
    if (currentAttempt.attempt_id.startsWith('local-')) {
      const state = gameRef.current;
      if (state?.status === 'running') commitGame({ ...state, status: 'stopped' });
      setMessage('练习已完成，本次不计算成绩。');
      return;
    }
    try {
      let server = await sendCommands(currentAttempt, validation.expanded, programSnapshot);
      if (server && !server.is_terminal) {
        const response = await fetch(`/api/attempts/${currentAttempt.attempt_id}/finalize`, { method: 'POST', credentials: 'include' });
        server = await response.json();
      }
      if (server) acceptServerResult(server);
    } catch (error) { setMessage(error instanceof Error ? error.message : '程序提交失败'); }
  };

  const stopAttempt = async () => {
    const current = attemptRef.current;
    if (!current) return;
    await commandChain.current;
    if (levelRef.current?.step_limit && !current.attempt_id.startsWith('local-')) {
      try {
        const response = await fetch(`/api/attempts/${current.attempt_id}/finalize`, { method: 'POST', credentials: 'include' });
        const result = await response.json() as ServerResult;
        if (!response.ok) throw new Error('结算失败');
        acceptServerResult(result);
        return;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '结算失败');
        return;
      }
    }
    stopRemoteAttempt(current);
    const state = gameRef.current;
    if (state) commitGame({ ...state, status: 'stopped' });
    telemetryRef.current?.track('attempt_stopped', 'attempt.stop', {});
  };

  if (loadingError) return <div className="fatal"><b>项目未能启动</b><span>{loadingError}</span><small>请确认服务端已运行，再刷新页面。</small></div>;
  if (!player || !currentLevel || !gameState) return <div className="loading"><span className="loader" />正在准备淘金地图…</div>;

  const practiceCompleted = Boolean(attempt?.attempt_id.startsWith('local-')) && gameState.status !== 'running';
  const displayMessage = practiceCompleted ? '练习结束，不计分。' : message || (gameState.status === 'success' && !score ? '金币已全部收集，正在等待服务端确认。' : null);
  const currentLevelIndex = levels.findIndex(level => level.level_id === currentLevel.level_id);
  const nextLevel = currentLevelIndex >= 0 ? levels[currentLevelIndex + 1] : undefined;
  const active = Boolean(attempt) && gameState.status === 'running';
  const totalValue = currentLevel.coins.reduce((sum, coin) => sum + (coin.value ?? 1), 0);
  const collectedValue = currentLevel.coins
    .filter((coin) => gameState.collected.includes(coin.id))
    .reduce((sum, coin) => sum + (coin.value ?? 1), 0);
  const hasChest = currentLevel.coins.some((coin) => coin.type === 'chest');
  const displayOrder = currentLevel.required_order?.map((_, index) => circledNumber(index + 1));

  return (
    <div className="app">
      {!modeSelected && <div className="onboarding" role="dialog" aria-modal="true">
        <div className="onboarding-card">
          <span className="eyebrow">身份已经生成</span><h1>欢迎来到旷野淘金</h1>
          <div className="identity-card"><img src="/assets/car.png" alt="" /><div><small>你的玩家名</small><b>{player.display_name}</b><code>{player.player_uuid}</code></div></div>
          <p>请选择本次挑战的操作模式，进入后不再切换。</p>
          <div className="experience-grid">
            <button onClick={() => chooseMode('keyboard')} data-track-id="onboarding.mode.keyboard">⌨ 键盘操控<small>使用方向键 / WASD，也可点击方向按钮</small></button>
            <button onClick={() => chooseMode('python_blank')} data-track-id="onboarding.mode.python_blank">&lt;/&gt; 代码操控<small>编排移动指令，运行代码完成挑战</small></button>
          </div>
        </div>
      </div>}

      <header className="app-header">
        <div className="brand"><div className="brand-mark">◆</div><div><span>校园挑战</span><b>旷野淘金</b></div></div>
        <div className="current-mode" aria-label="当前操作模式">{modeSelected ? (mode === 'keyboard' ? '⌨ 键盘操控' : '</> 代码操控') : '请选择操作模式'}</div>
        <div className="header-actions">
          <div className="player-info" title={player.player_uuid} data-track-id="player.identity">
            <span className="online-dot" /><div><b>{player.display_name}</b><small>{player.player_uuid.slice(0, 8)}</small></div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <LevelNav levels={levels} currentLevelId={currentLevel.level_id} onSelect={selectLevel} />
        <main className="game-area">
          <section className="mission-card">
            <div className="mission-number">{currentLevel.level_id.slice(1)}</div>
            <div className="mission-copy"><h1>{currentLevel.title}</h1></div>
            <div className="mission-meta"><span>{currentLevel.width}×{currentLevel.height}</span><span>{totalValue} 点金币价值</span>{currentLevel.step_limit && <strong>{currentLevel.step_limit} 步预算</strong>}</div>
          </section>

          <div className="workspace-grid">
            <section className="board-panel">
              <div className="panel-heading"><div><span>本关任务</span><b>{currentLevel.objective}</b><small className="board-rule-hint">{currentLevel.rule_hint}</small></div><div className="legend"><span><i className="legend-start" />起点</span>{currentLevel.walls.length > 0 && <span><i className="legend-wall" />封闭区</span>}{hasChest && <span><i className="legend-chest" />金币箱 ×3</span>}</div></div>
              <GameBoard level={currentLevel} state={gameState} />
              <div className="status-bar">
                <div><small>{currentLevel.step_limit ? '步数预算' : '有效步数'}</small><b>{gameState.steps}{currentLevel.step_limit && <em> / {currentLevel.step_limit}</em>}</b></div>
                <div><small>碰撞次数</small><b>{gameState.collisions}</b></div>
                <div><small>已拾取价值</small><b>{collectedValue}<em> / {totalValue}</em></b></div>
                <div className={`status-pill status-${gameState.status}`}>{statusLabel(gameState.status)}</div>
              </div>
            </section>

            <aside className="control-column">
              <section className="attempt-summary" aria-label="本关成绩与尝试次数">
                <div className="attempt-summary-metrics">
                  <div><span>{attempt?.attempt_id.startsWith('local-') ? '当前模式' : attempt ? '正式尝试' : '剩余正式机会'}</span><strong>{attempt?.attempt_id.startsWith('local-') ? '练习' : <>{attempt ? attempt.trial_index : progress?.remaining_attempts ?? '—'}<small> / 3</small></>}</strong></div>
                  <div><span>本关最高分</span><strong>{progress?.final_score ?? '—'}<small> 分</small></strong></div>
                </div>
                <p>每种模式各 3 次，取最高分；练习不计分。</p>
              </section>
              {currentLevel.required_order && <div className="required-order"><small>本关指定顺序</small><b>{displayOrder?.join(' → ')}</b></div>}

              {mode === 'keyboard' ? <section className="keyboard-card">
                <div className="mini-heading"><span>方向控制</span><small>方向键 / WASD</small></div>
                <div className="dpad">
                  <button className={`dpad-btn up${litDirection === 'up' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('up')} disabled={!active} data-track-id="move.up" aria-label="向上">↑</button>
                  <button className={`dpad-btn left${litDirection === 'left' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('left')} disabled={!active} data-track-id="move.left" aria-label="向左">←</button>
                  <div className="dpad-core">◆</div>
                  <button className={`dpad-btn right${litDirection === 'right' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('right')} disabled={!active} data-track-id="move.right" aria-label="向右">→</button>
                  <button className={`dpad-btn down${litDirection === 'down' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('down')} disabled={!active} data-track-id="move.down" aria-label="向下">↓</button>
                </div>
                {!attempt ? <button className="primary-action" onClick={() => void beginAttempt(false)} data-track-id="attempt.start">{progress?.remaining_attempts === 0 ? '开始练习（不计分）' : '开始本关'}</button>
                  : active ? <button className="secondary-action" onClick={() => void stopAttempt()} data-track-id="attempt.stop">{currentLevel.step_limit ? '结束并结算' : '停止本轮'}</button>
                  : !score && <button className="primary-action" onClick={() => resetGame(false)} data-track-id="attempt.reset">再试一次</button>}
              </section> : <PythonEditor config={currentLevel.python} rows={rows} onChange={setRows} onRun={() => void runPython()} isRunning={animating} error={editorError} />}

              {score && <section className="score-panel">
                <div className="score-total"><span>{currentLevel.step_limit ? '本关结算' : '本轮得分'}</span><b>{score.total_score}</b><em>/ 100</em></div>
                {currentLevel.step_limit
                  ? <><div className="score-parts"><span>价值 {score.collected_value} / {score.total_value}</span><span>预算 {score.steps} / {currentLevel.step_limit} 步</span></div><p>{score.collected_value === score.optimal_value ? `你拿到了预算内最高的 ${score.optimal_value} 点价值！` : `预算内最高可得 ${score.optimal_value} 点，再比较一下目标价值和绕行距离。`}</p></>
                  : <><div className="score-parts"><span>金币 {score.collection_score}/60</span><span>路线 {score.route_score}/40</span></div><p>{currentLevel.show_optimal_feedback ? (score.steps === score.optimal_steps ? '你走出了最短路线！' : `最短 ${score.optimal_steps} 步，本轮 ${score.steps} 步。`) : '全部金币都已收集，操控任务完成！'}</p></>}
                {score.total_score >= 100
                  ? nextLevel
                    ? <button onClick={() => selectLevel(nextLevel)} data-track-id="attempt.next_level">下一关</button>
                    : <p role="status">最后一关已满分完成！</p>
                  : <button onClick={() => resetGame(false)} data-track-id="attempt.reset_after_score">重新挑战</button>}
              </section>}
              {displayMessage && <div className={`message${practiceCompleted ? ' success' : ''}`} role="status">{displayMessage}</div>}
            </aside>
          </div>
        </main>
      </div>
      <footer><span>玩家操作与时间节点已记录</span><span>{currentLevel.step_limit ? '规则：步数用完直接结算，不设强制失败' : '规则：捡完全部金币即结束，不必返回起点'}</span></footer>
    </div>
  );
}

function circledNumber(number: number) {
  return ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][number - 1] ?? String(number);
}

function statusLabel(status: GameStatus) {
  const labels: Record<GameStatus, string> = {
    draft: '未开始', running: '进行中', success: '完成', order_violation: '顺序错误',
    command_limit: '指令超限', incomplete: '未完成', stopped: '已停止', abandoned: '已放弃', expired: '已过期',
  };
  return labels[status];
}
