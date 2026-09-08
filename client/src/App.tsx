import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGameState, generateInitialRows, generatePythonSource, step, validateAndExpand,
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
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [animating, setAnimating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [planOrder, setPlanOrder] = useState<string[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const levelRef = useRef<LevelDef | null>(null);
  const modeRef = useRef<Mode>('keyboard');
  const attemptRef = useRef<AttemptInfo | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const telemetryRef = useRef<TelemetryClient | null>(null);
  const commandChain = useRef<Promise<void>>(Promise.resolve());

  const commitGame = (state: GameState) => {
    gameRef.current = state;
    setGameState({ ...state });
  };

  const selectLevel = useCallback((level: LevelDef) => {
    levelRef.current = level;
    setCurrentLevel(level);
    commitGame(createGameState(level));
    setRows(generateInitialRows(level.python));
    setAttempt(null); attemptRef.current = null;
    setScore(null); setMessage(null); setEditorError(null); setPlanOrder([]);
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

  const chooseExperience = async (language: NonNullable<Player['language_experience']>) => {
    telemetryRef.current?.track('profile_experience_selected', `onboarding.experience.${language}`, { language });
    try {
      const response = await fetch('/api/players/profile', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language_experience: language }),
      });
      if (!response.ok) throw new Error();
      setPlayer(await response.json());
    } catch { setMessage('学习经历保存失败，请检查服务器连接。'); }
  };

  const stopRemoteAttempt = (current = attemptRef.current) => {
    if (!current || current.attempt_id.startsWith('local-')) return;
    void fetch(`/api/attempts/${current.attempt_id}/stop`, { method: 'POST', credentials: 'include' });
  };

  const resetGame = useCallback((stopRemote = true) => {
    const level = levelRef.current;
    if (!level) return;
    if (stopRemote && attemptRef.current && gameRef.current?.status === 'running') stopRemoteAttempt();
    attemptRef.current = null; setAttempt(null);
    commitGame(createGameState(level));
    setScore(null); setMessage(null); setEditorError(null);
    setRows(generateInitialRows(level.python));
    commandChain.current = Promise.resolve();
    telemetryRef.current?.track('attempt_reset', 'attempt.reset', {});
  }, []);

  const changeMode = (nextMode: Mode) => {
    if (modeRef.current === nextMode) return;
    resetGame();
    modeRef.current = nextMode; setMode(nextMode);
    telemetryRef.current?.track('mode_changed', `mode.${nextMode}`, { mode: nextMode });
  };

  const beginAttempt = async (preserveProgram: boolean): Promise<AttemptInfo | null> => {
    const level = levelRef.current;
    if (!level) return null;
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
      if (!response.ok) throw new Error(body.error || '无法开始本轮');
      const next = body as AttemptInfo;
      attemptRef.current = next; setAttempt(next);
      telemetryRef.current?.track('attempt_started', 'attempt.start', { assignment_key: assignmentKey, trial_index: next.trial_index });
      return next;
    } catch (error) {
      const next = { attempt_id: `local-${crypto.randomUUID()}`, trial_index: 1, assignment_key: assignmentKey };
      attemptRef.current = next; setAttempt(next);
      setMessage(error instanceof Error ? `${error.message}；已进入本机练习，不记录正式成绩。` : '已进入本机练习。');
      return next;
    }
  };

  const applyLocalCommand = (direction: Direction, source: Mode) => {
    const level = levelRef.current;
    const state = gameRef.current;
    if (!level || !state || state.status !== 'running') return null;
    const commandIndex = state.consumed_commands + 1;
    telemetryRef.current?.track('command_issued', `move.${direction}`, { direction, source, command_index: commandIndex });
    const result = step(state, {
      direction, command_index: commandIndex, command_id: crypto.randomUUID(), source,
    }, level.required_order, level.coins.length, level.max_commands);
    commitGame(result.state);
    telemetryRef.current?.track(result.event.type, 'game.board', { ...result.event });
    return result.state;
  };

  const acceptServerResult = (result: ServerResult) => {
    setScore(result.score);
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
    const nextState = applyLocalCommand(direction, 'keyboard');
    commandChain.current = commandChain.current.then(async () => {
      try {
        const server = await sendCommands(currentAttempt, [direction]);
        if (server?.is_terminal) acceptServerResult(server);
      } catch (error) { setMessage(error instanceof Error ? error.message : '指令提交失败'); }
    });
    if (nextState?.status !== 'running') setMessage('路线已结束，正在核验成绩…');
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
    stopRemoteAttempt(current);
    const state = gameRef.current;
    if (state) commitGame({ ...state, status: 'stopped' });
    telemetryRef.current?.track('attempt_stopped', 'attempt.stop', {});
  };

  const addPlanCoin = (coinId: string) => {
    const next = [...planOrder, coinId];
    setPlanOrder(next);
    telemetryRef.current?.track('plan_coin_added', `planner.coin.${coinId}`, { coin_id: coinId, planned_order: next });
  };

  if (loadingError) return <div className="fatal"><b>项目未能启动</b><span>{loadingError}</span><small>请确认服务端已运行，再刷新页面。</small></div>;
  if (!player || !currentLevel || !gameState) return <div className="loading"><span className="loader" />正在准备淘金地图…</div>;

  const currentAssignment = mode === 'keyboard' ? currentLevel.keyboard_id : currentLevel.python_id;
  const active = Boolean(attempt) && gameState.status === 'running';
  const availablePlanCoins = currentLevel.coins.filter((coin) => !planOrder.includes(coin.id));

  return (
    <div className="app">
      {!player.language_experience && <div className="onboarding" role="dialog" aria-modal="true">
        <div className="onboarding-card">
          <span className="eyebrow">身份已经生成</span><h1>欢迎来到旷野淘金</h1>
          <div className="identity-card"><img src="/assets/car.png" alt="" /><div><small>你的玩家名</small><b>{player.display_name}</b><code>{player.player_uuid}</code></div></div>
          <p>请选择你学过的编程语言。它只用于比较两组同学的学习表现，不影响关卡内容。</p>
          <div className="experience-grid">
            <button onClick={() => chooseExperience('python')} data-track-id="onboarding.experience.python">学过 Python</button>
            <button onClick={() => chooseExperience('cpp')} data-track-id="onboarding.experience.cpp">只学过 C++</button>
            <button onClick={() => chooseExperience('both')} data-track-id="onboarding.experience.both">两种都学过</button>
            <button onClick={() => chooseExperience('none')} data-track-id="onboarding.experience.none">都没学过</button>
          </div>
        </div>
      </div>}

      <header className="app-header">
        <div className="brand"><div className="brand-mark">◆</div><div><span>校园挑战</span><b>旷野淘金</b></div></div>
        <div className="mode-switch" aria-label="操作模式">
          <button className={mode === 'keyboard' ? 'active' : ''} onClick={() => changeMode('keyboard')} data-track-id="mode.keyboard">⌨ 键盘操控</button>
          <button className={mode === 'python_blank' ? 'active' : ''} onClick={() => changeMode('python_blank')} data-track-id="mode.python_blank">&lt;/&gt; 代码操控</button>
        </div>
        <div className="header-actions">
          <a className="teacher-link" href="/teacher" data-track-id="nav.teacher">数据看板</a>
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
            <div className="mission-copy"><span>{currentAssignment} · {stageLabel(currentLevel.stage)}</span><h1>{currentLevel.title}</h1><p>{currentLevel.objective}</p></div>
            <div className="mission-meta"><span>{currentLevel.width}×{currentLevel.height}</span><span>{currentLevel.coins.length} 枚金币</span></div>
          </section>

          <div className="workspace-grid">
            <section className="board-panel">
              <div className="panel-heading"><div><span>实时地图</span><b>先想顺序，再走路线</b></div><div className="legend"><span><i className="legend-start" />起点</span><span><i className="legend-wall" />障碍</span></div></div>
              <GameBoard level={currentLevel} state={gameState} />
              <div className="status-bar">
                <div><small>有效步数</small><b>{gameState.steps}</b></div>
                <div><small>碰撞次数</small><b>{gameState.collisions}</b></div>
                <div><small>已捡金币</small><b>{gameState.collected.length}<em> / {currentLevel.coins.length}</em></b></div>
                <div className={`status-pill status-${gameState.status}`}>{statusLabel(gameState.status)}</div>
              </div>
            </section>

            <aside className="control-column">
              {currentLevel.stage === 'challenge' && <section className="planner-card">
                <div className="mini-heading"><span>路线草稿</span><button onClick={() => setPlanOrder([])} data-track-id="planner.reset">清空</button></div>
                <div className="planned-order">{planOrder.length ? planOrder.map((coin, index) => <span key={coin}>{index ? '→' : ''}<b>{coin}</b></span>) : <small>按计划的拾取顺序点金币</small>}</div>
                <div className="coin-choices">{availablePlanCoins.map((coin) => <button key={coin.id} onClick={() => addPlanCoin(coin.id)} data-track-id={`planner.coin.${coin.id}`}>{coin.id}</button>)}</div>
              </section>}
              {currentLevel.required_order && <div className="required-order"><small>本关指定顺序</small><b>{currentLevel.required_order.join(' → ')}</b></div>}

              {mode === 'keyboard' ? <section className="keyboard-card">
                <div className="mini-heading"><span>方向控制</span><small>方向键 / WASD</small></div>
                <div className="dpad">
                  <button className="dpad-btn up" onClick={() => executeKeyboard('up')} disabled={!active} data-track-id="move.up" aria-label="向上">↑</button>
                  <button className="dpad-btn left" onClick={() => executeKeyboard('left')} disabled={!active} data-track-id="move.left" aria-label="向左">←</button>
                  <div className="dpad-core">◆</div>
                  <button className="dpad-btn right" onClick={() => executeKeyboard('right')} disabled={!active} data-track-id="move.right" aria-label="向右">→</button>
                  <button className="dpad-btn down" onClick={() => executeKeyboard('down')} disabled={!active} data-track-id="move.down" aria-label="向下">↓</button>
                </div>
                {!attempt ? <button className="primary-action" onClick={() => void beginAttempt(false)} data-track-id="attempt.start">开始本关</button>
                  : active ? <button className="secondary-action" onClick={() => void stopAttempt()} data-track-id="attempt.stop">停止本轮</button>
                  : <button className="primary-action" onClick={() => resetGame(false)} data-track-id="attempt.reset">再试一次</button>}
              </section> : <PythonEditor config={currentLevel.python} rows={rows} onChange={setRows} onRun={() => void runPython()} isRunning={animating} error={editorError} />}

              {score && <section className="score-panel">
                <div className="score-total"><span>本轮得分</span><b>{score.total_score}</b><em>/ 100</em></div>
                <div className="score-parts"><span>金币 {score.collection_score}/60</span><span>路线 {score.route_score}/40</span></div>
                <p>{score.steps === score.optimal_steps ? '你走出了最短路线！' : `最短 ${score.optimal_steps} 步，本轮 ${score.steps} 步。`}</p>
                <button onClick={() => resetGame(false)} data-track-id="attempt.reset_after_score">重新挑战</button>
              </section>}
              {message && <div className="message" role="status">{message}</div>}
              {gameState.status === 'success' && !score && <div className="message success">金币已全部收集，正在等待服务端确认。</div>}
              {gameState.status === 'order_violation' && <div className="message error">经过了错误的金币，请重新规划避让路线。</div>}
            </aside>
          </div>
        </main>
      </div>
      <footer><span>玩家操作与时间节点已记录</span><span>规则：捡完全部金币即结束，不必返回起点</span></footer>
    </div>
  );
}

function stageLabel(stage: LevelDef['stage']) {
  return ({ explore: '探索阶段', guided: '引导阶段', challenge: '挑战阶段' })[stage];
}

function statusLabel(status: GameStatus) {
  const labels: Record<GameStatus, string> = {
    draft: '未开始', running: '进行中', success: '完成', order_violation: '顺序错误',
    command_limit: '指令超限', incomplete: '未完成', stopped: '已停止', abandoned: '已放弃', expired: '已过期',
  };
  return labels[status];
}
