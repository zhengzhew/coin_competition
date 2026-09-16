import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGameState, createUuid, generateInitialRows, generatePythonSource, step, validateAndExpand, countCodeLines,
  type Direction, type Action, type GameState, type GameStatus, type LevelDef, type Mode,
  type ScoreResult, type TemplateRow,
} from '@coin-path/shared';
import GameBoard from './components/GameBoard';
import LevelNav from './components/LevelNav';
import PythonEditor from './components/PythonEditor';
import RobotEditor from './components/RobotEditor';
import {robotSceneTheme} from './components/robot-scene-theme';
import { TelemetryClient } from './telemetry';
import './App.css';
import { competition, isFuture, skin } from './theme';
import './FutureCity.css';

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
  const [nameInput, setNameInput] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const savingIdentityRef = useRef(false);
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [currentLevel, setCurrentLevel] = useState<LevelDef | null>(null);
  const [mode, setMode] = useState<Mode>('keyboard');
  const [modeSelected, setModeSelected] = useState(false);
  const [litDirection, setLitDirection] = useState<Action | null>(null);
  const lightTimer = useRef<number | null>(null);
  useEffect(() => () => { if (lightTimer.current !== null) window.clearTimeout(lightTimer.current); }, []);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [attempt, setAttempt] = useState<AttemptInfo | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [submittedLines,setSubmittedLines]=useState<number|null>(null);
  const [animating, setAnimating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ remaining_attempts: number; final_score: number | null } | null>(null);
  const startingRef = useRef(false);
  const switchingRef = useRef(false);
  const [switchingMode, setSwitchingMode] = useState(false);

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
    const preserveProgram=!!level.robot&&levelRef.current?.level_id===level.level_id;
    setSubmittedLines(null);
    markLevelEntry('level_selected');
    levelRef.current = level;
    setCurrentLevel(level);
    commitGame(createGameState(level));
    if(!preserveProgram)setRows(generateInitialRows(level.python));
    setAttempt(null); attemptRef.current = null;
    setScore(null); setMessage(null); setEditorError(null);
    telemetryRef.current?.track('level_selected', `nav.level.${level.level_id}`, { level_id: level.level_id, coin_count: level.coins.length });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/players/bootstrap?competition=${competition}`, { method: 'POST', credentials: 'include' }).then(async (response) => {
        if (!response.ok) throw new Error('无法建立玩家身份');
        return response.json() as Promise<Player>;
      }),
      fetch(`/api/levels?competition=${competition}`).then(async (response) => {
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
    if (!player || !identityConfirmed) return;
    const telemetry = new TelemetryClient({
      playerUuid: player.player_uuid,
      assignmentKey: () => {
        const level = levelRef.current;
        return level ? (modeRef.current === 'keyboard' ? level.keyboard_id : level.python_id) : null;
      },
      levelId: () => levelRef.current?.level_id ?? null,
      mode: () => modeRef.current,
      attemptId: () => attemptRef.current?.attempt_id ?? null,
      contentVersion: () => levelRef.current?.content_version ?? null,
    });
    telemetryRef.current = telemetry;
    void telemetry.start().catch(() => setMessage('埋点服务暂时离线，操作会先保存在本机。'));
    return () => telemetry.stop();
  }, [player?.player_uuid, identityConfirmed]);

  const stopRemoteAttempt = (current = attemptRef.current) => {
    if (!current || current.attempt_id.startsWith('local-')) return;
    void fetch(`/api/attempts/${current.attempt_id}/stop`, { method: 'POST', credentials: 'include' });
  };

  const resetGame = useCallback((stopRemote = true) => {
    setSubmittedLines(null);
    const level = levelRef.current;
    if (!level) return;
    markLevelEntry('retry');
    if (stopRemote && attemptRef.current && gameRef.current?.status === 'running') stopRemoteAttempt();
    attemptRef.current = null; setAttempt(null);
    commitGame(createGameState(level));
    setScore(null); setMessage(null); setEditorError(null);
    if(!level.robot)setRows(generateInitialRows(level.python));
    commandChain.current = Promise.resolve();
    telemetryRef.current?.track('attempt_reset', 'attempt.reset', {});
  }, []);

  const chooseMode = (nextMode: Mode) => {
    if (!identityConfirmed) return;
    modeRef.current = nextMode; setMode(nextMode);
    setModeSelected(true);
    markLevelEntry('onboarding_completed');
    telemetryRef.current?.track('mode_selected', `onboarding.mode.${nextMode}`, { mode: nextMode });
  };

  const switchMode = async () => {
    if (!identityConfirmed || startingRef.current || animating || switchingRef.current) return;
    switchingRef.current = true;
    setSwitchingMode(true);
    try {
      await commandChain.current;
      const current = attemptRef.current;
      if (current && !current.attempt_id.startsWith('local-') && gameRef.current?.status === 'running') {
        const response = await fetch(`/api/attempts/${current.attempt_id}/stop`, { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error('当前挑战未能结束，请重试切换。');
      }
      const nextMode = modeRef.current === 'keyboard' ? 'python_blank' : 'keyboard';
      const savedRows = rows;
      resetGame(false);
      setRows(savedRows);
      modeRef.current = nextMode;
      setMode(nextMode);
      setProgress(null);
      markLevelEntry('mode_switched');
      telemetryRef.current?.track('mode_selected', 'header.mode.switch', { mode: nextMode });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模式切换失败，请重试。');
    } finally {
      switchingRef.current = false;
      setSwitchingMode(false);
    }
  };

  const confirmIdentity = async () => {
    if (savingIdentityRef.current) return;
    const name = nameInput.trim();
    if (!name || name.length > 40) {
      setIdentityError('请输入 1–40 个字符的姓名');
      return;
    }
    savingIdentityRef.current = true;
    setSavingIdentity(true);
    setIdentityError(null);
    try {
      const response = await fetch('/api/players/profile', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      });
      if (!response.ok) throw new Error('姓名保存失败，请重试。');
      const nextPlayer = await response.json() as Player;
      setPlayer(nextPlayer);
      setIdentityConfirmed(true);
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : '姓名保存失败，请重试。');
    } finally {
      savingIdentityRef.current = false;
      setSavingIdentity(false);
    }
  };

  const beginAttempt = async (preserveProgram: boolean): Promise<AttemptInfo | null> => {
    const level = levelRef.current;
    if (!level || startingRef.current || switchingRef.current) return null;
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
    if (!preserveProgram&&!level.robot) setRows(generateInitialRows(level.python));
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

  const applyLocalCommand = (direction: Action, source: Mode) => {
    const level = levelRef.current;
    const state = gameRef.current;
    if (!level || !state || state.status !== 'running') return null;
    const commandIndex = state.consumed_commands + 1;
    telemetryRef.current?.track('command_issued', `move.${direction}`, { direction, source, command_index: commandIndex });
    const result = step(state, {
      direction, command_index: commandIndex, command_id: createUuid(), source,
    }, level.required_order, level.coins.length, level.max_commands, level.step_limit);
    commitGame(result.state);
    if(level.robot) setMessage(result.event.type==='action_empty' ? (level.robot.automation?(result.state.robot?.automation?.last_result==='latched'?'先按 R 复位拉杆。':'请面向开关，等货物与物流车同时到位。'):direction==='grab'?'车头前一格没有可夹取的货物。':'前方无法放置，请换一个空格。') : result.event.type==='collision'?'前方无法通行。':null);
    telemetryRef.current?.track(result.event.type, 'game.board', { ...result.event });
    if (result.event.type === 'order_violation') {
      setMessage(isFuture ? '请先收集当前编号的能源芯。' : '这枚金币还没轮到，已保留在地图上；请先拾取当前编号。');
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

  const sendCommands = async (currentAttempt: AttemptInfo, commands: Action[], programSnapshot?: string) => {
    if (currentAttempt.attempt_id.startsWith('local-')) return null;
    const response = await fetch(`/api/attempts/${currentAttempt.attempt_id}/commands`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, program_snapshot: programSnapshot }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '指令提交失败');
    return body as ServerResult;
  };

  const executeKeyboard = useCallback((direction: Action) => {
    const currentAttempt = attemptRef.current;
    if (!currentAttempt || switchingRef.current || modeRef.current !== 'keyboard' || gameRef.current?.status !== 'running') return;
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
      if (event.target instanceof HTMLElement && (event.target.matches('input,textarea,select') || event.target.isContentEditable) || modeRef.current !== 'keyboard') return;
      const robotKeys: Record<string,Action>={w:'forward',s:'backward',a:'turn_left',d:'turn_right',g:'grab',r:'release',arrowup:'forward',arrowdown:'backward',arrowleft:'turn_left',arrowright:'turn_right'};
      if(levelRef.current?.robot?.automation)robotKeys[' ']='wait';
      const direction = levelRef.current?.robot ? robotKeys[event.key.toLowerCase()] : keyMap[event.key];
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
    setSubmittedLines(countCodeLines(rows));
    const programSnapshot = generatePythonSource(rows, level.python);
    telemetryRef.current?.track('program_run_started', 'python.run', { program_snapshot: programSnapshot, expanded_steps: validation.expanded.length, code_line_count:countCodeLines(rows), optimal_code_lines:level.optimal_code_lines });
    setAnimating(true);
    for (const direction of validation.expanded) {
      await sleep(level.robot?320:95);
      const state = applyLocalCommand(direction, 'python_blank');
      if (state?.status !== 'running') break;
    }
    if (currentAttempt.attempt_id.startsWith('local-')) {
      setAnimating(false);
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
    finally { setAnimating(false); }
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
  if (!player || !currentLevel || !gameState) return <div className={`loading${isFuture ? ' future-loading' : ''}`}><span className="loader" />{isFuture ? '正在连接未来城市…' : '正在准备淘金地图…'}</div>;

  if (!identityConfirmed) return (
    <div className={`app${isFuture ? ' future-city' : ''}`}>
      <div className="onboarding">
        <form className="onboarding-card" aria-labelledby="identity-heading" onSubmit={event => { event.preventDefault(); void confirmIdentity(); }}>
          <span className="eyebrow">开始挑战前</span>
          <h1 id="identity-heading">欢迎来到{skin.title}</h1>
          <p>请输入你的名字，确认后选择操作模式。</p>
          <div className="identity-fields">
            <label htmlFor="player-name">你的名字
              <input id="player-name" autoFocus autoComplete="off" maxLength={40} required value={nameInput}
                placeholder="请输入姓名" disabled={savingIdentity} aria-invalid={!!identityError} aria-describedby={identityError ? 'identity-error' : undefined}
                onChange={event => { setNameInput(event.target.value); setIdentityError(null); }} />
            </label>
            <div className="identity-random-id"><span>随机 ID</span><code data-testid="player-random-id">{player.player_uuid}</code></div>
          </div>
          <p>更换姓名后，确认时会绑定新的随机 ID，原玩家的成绩会保留。</p>
          {identityError && <p id="identity-error" className="identity-error" role="alert">{identityError}</p>}
          <button className="identity-confirm" type="submit" disabled={savingIdentity || !nameInput.trim()}>{savingIdentity ? '正在确认…' : '确认'}</button>
        </form>
      </div>
    </div>
  );

  const practiceCompleted = Boolean(attempt?.attempt_id.startsWith('local-')) && gameState.status !== 'running';
  const displayMessage = practiceCompleted ? '练习结束，不计分。' : message || (gameState.status === 'success' && !score ? (isFuture ? '任务完成，正在确认成绩…' : '金币已全部收集，正在等待服务端确认。') : null);
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
    <div className={`app${isFuture ? ' future-city' : ''}`}>
      {!modeSelected && <div className="onboarding" role="dialog" aria-modal="true">
        <div className="onboarding-card">
          <span className="eyebrow">{isFuture ? '循环搬运 · 测试赛' : '身份已经生成'}</span><h1>欢迎来到{skin.title}</h1>
          <div className="identity-card"><img src={skin.vehicle} alt="" /><div><small>{isFuture ? '你的领航员身份' : '你的玩家名'}</small><b>{player.display_name}</b><code>{player.player_uuid}</code></div></div>
          <p>请选择操作模式，进入后可通过顶部按钮切换。</p>
          <div className="experience-grid">
            <button onClick={() => chooseMode('keyboard')} data-track-id="onboarding.mode.keyboard">⌨ 键盘操控<small>{isFuture ? '方向键 / WASD / 方向按钮' : '使用方向键 / WASD，也可点击方向按钮'}</small></button>
            <button onClick={() => chooseMode('python_blank')} data-track-id="onboarding.mode.python_blank">&lt;/&gt; 代码操控<small>{isFuture ? '编排航线，让飞空车自动执行' : '编排移动指令，运行代码完成挑战'}</small></button>
          </div>
        </div>
      </div>}

      <header className="app-header">
        <div className="brand"><div className="brand-mark">{isFuture ? '✦' : '◆'}</div><div><span>{skin.subtitle}</span><b>{skin.title}</b></div></div>
        <div className="header-mode-controls">
          <div className="current-mode" aria-label="当前操作模式">{modeSelected ? (mode === 'keyboard' ? '⌨ 键盘操控' : '</> 代码操控') : '请选择操作模式'}</div>
          {modeSelected && <button className="mode-toggle" onClick={() => void switchMode()} disabled={animating || switchingMode}
            title={animating ? '程序运行及成绩核验完成后可切换' : '切换后重新开始本关，已编写的代码会保留'} data-track-id="header.mode.switch">
            {switchingMode ? '正在切换…' : mode === 'keyboard' ? '切换到代码操控' : '切换到键盘操控'}
          </button>}
        </div>
        <div className="header-actions">
          <div className="player-info" title={player.player_uuid} data-track-id="player.identity">
            <span className="online-dot" /><div><b>{player.display_name}</b><small>{player.player_uuid.slice(0, 8)}</small></div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <LevelNav levels={levels} currentLevelId={currentLevel.level_id} onSelect={selectLevel} />
        <main className="game-area">
          {!currentLevel.robot && <section className="mission-card">
            <div className="mission-number">{currentLevel.robot?String(currentLevelIndex+1).padStart(2,'0'):currentLevel.level_id.slice(-2)}</div>
            <div className="mission-copy"><h1>{currentLevel.title}</h1></div>
            <div className="mission-meta"><span>{currentLevel.robot?'立体城市':`${currentLevel.width}×${currentLevel.height}`}</span><span>{totalValue} {isFuture ? '箱货物' : '点金币价值'}</span>{currentLevel.step_limit && <strong>{currentLevel.step_limit} 步预算</strong>}</div>
          </section>}

          <div className={`workspace-grid${currentLevel.robot?' robot-workspace':''}`}>
            {currentLevel.robot && <section className="mission-card"><div className="mission-number">{String(currentLevelIndex+1).padStart(2,'0')}</div><div className="mission-copy"><h1>{currentLevel.title}</h1></div></section>}
            <section className="board-panel">
              <div className="panel-heading"><div><span>{currentLevel.robot?robotSceneTheme(currentLevel).name:'本关任务'}</span><b>{currentLevel.objective}</b><small className="board-rule-hint">{currentLevel.rule_hint}</small></div>
                {currentLevel.robot?<div className="legend robot-legend">
                  {currentLevel.coins.some(c=>c.type==='checkpoint')&&<span><i className="legend-patrol"/>巡逻点</span>}
                  {Object.keys(currentLevel.robot.deliveries).length>0&&<><span><i className="legend-cargo"/>货物</span><span><i className="legend-dock"/>交货点</span></>}
                </div>:<div className="legend"><span><i className="legend-start" />{isFuture ? '任务站' : '起点'}</span>{currentLevel.walls.length > 0 && <span><i className="legend-wall" />{isFuture ? '高楼' : '封闭区'}</span>}{hasChest && <span><i className="legend-chest" />{isFuture ? '超级芯' : '金币箱'} ×3</span>}</div>}
              </div>
              <GameBoard level={currentLevel} state={gameState} />
              <div className="status-bar">
                {currentLevel.robot ? <div data-track-id="status.actions"><small>行动次数{currentLevel.optimal_actions!==undefined&&` · 最优 ≤ ${currentLevel.optimal_actions}`}</small><b>{gameState.consumed_commands}</b></div> : <><div><small>{currentLevel.step_limit ? '步数预算' : '有效步数'}</small><b>{gameState.steps}{currentLevel.step_limit && <em> / {currentLevel.step_limit}</em>}</b></div>
                <div><small>碰撞次数</small><b>{gameState.collisions}</b></div></>}
                <div><small>{isFuture ? '已完成目标' : '已拾取价值'}</small><b>{collectedValue}<em> / {totalValue}</em></b></div>
                <div className={`status-pill status-${gameState.status}`}>{statusLabel(gameState.status)}</div>
              </div>
            </section>

            <aside className="control-column">
              <section className="attempt-summary" aria-label="本关成绩与尝试次数">
                <div className="attempt-summary-metrics">
                  <div><span>{attempt?.attempt_id.startsWith('local-') ? '当前模式' : attempt ? '正式尝试' : '剩余正式机会'}</span><strong>{attempt?.attempt_id.startsWith('local-') ? '练习' : <>{attempt ? attempt.trial_index : progress?.remaining_attempts ?? '—'}<small> / 3</small></>}</strong></div>
                  <div><span>本关最高分</span><strong>{progress?.final_score ?? '—'}<small> 分</small></strong></div>
                </div>
                <p>{isFuture ? '3 次取最高分，练习不计分。' : '每种模式各 3 次，取最高分；练习不计分。'}</p>{currentLevel.optimal_actions!==undefined&&<p data-track-id="score.rules">完成 60 分 · 行动最优 80 分{mode==='python_blank'?' · 代码最优 100 分':''}</p>}
              </section>
              {currentLevel.required_order && <div className="required-order"><small>本关指定顺序</small><b>{displayOrder?.join(' → ')}</b></div>}

              {mode === 'keyboard' ? <section className="keyboard-card">
                <div className="mini-heading"><span>{currentLevel.robot?'驾驶与夹爪':'方向控制'}</span><small>{currentLevel.robot?'相对车头方向':'方向键 / WASD'}</small></div>
                {currentLevel.robot ? <><div className="robot-controls">
                  {([['forward','W','前进一格'],['turn_left','A','左转 90°'],['backward','S','后退一格'],['turn_right','D','右转 90°'],['grab','G','夹取'],['release','R','松开']] as const).map(([action,key,label])=><button key={action} className={litDirection===action?'is-lit':''} disabled={!active} onClick={()=>executeKeyboard(action)} data-track-id={`move.${action}`}><kbd>{key}</kbd>{currentLevel.robot?.automation&&action==='grab'?'拉杆':currentLevel.robot?.automation&&action==='release'?'复位':label}</button>)}
                  {currentLevel.robot.automation&&<button className="factory-wait" disabled={!active} onClick={()=>executeKeyboard('wait')} data-track-id="move.wait"><kbd>空格</kbd>等待一拍</button>}
                </div><p className="robot-holding">{currentLevel.robot.automation?(gameState.robot?.closed?'拉杆已拉下 · R 复位':'面向开关 · G 拉杆'):gameState.robot?.holding?`夹爪持有：${gameState.robot.holding}`:gameState.robot?.closed?'夹爪已合拢 · 空':'夹爪已张开'}</p></> : <div className="dpad">
                  <button className={`dpad-btn up${litDirection === 'up' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('up')} disabled={!active} data-track-id="move.up" aria-label="向上">↑</button>
                  <button className={`dpad-btn left${litDirection === 'left' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('left')} disabled={!active} data-track-id="move.left" aria-label="向左">←</button>
                  <div className="dpad-core">◆</div>
                  <button className={`dpad-btn right${litDirection === 'right' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('right')} disabled={!active} data-track-id="move.right" aria-label="向右">→</button>
                  <button className={`dpad-btn down${litDirection === 'down' ? ' is-lit' : ''}`} onClick={() => executeKeyboard('down')} disabled={!active} data-track-id="move.down" aria-label="向下">↓</button>
                </div>}
                {!attempt ? <button className="primary-action" onClick={() => void beginAttempt(false)} data-track-id="attempt.start">{progress?.remaining_attempts === 0 ? '开始练习（不计分）' : '开始本关'}</button>
                  : active ? <button className="secondary-action" onClick={() => void stopAttempt()} data-track-id="attempt.stop">{currentLevel.step_limit ? '结束并结算' : '停止本轮'}</button>
                  : !score && <button className="primary-action" onClick={() => resetGame(false)} data-track-id="attempt.reset">再试一次</button>}
              </section> : currentLevel.robot ? <RobotEditor key={currentLevel.level_id} onReset={()=>resetGame()} factory={!!currentLevel.robot.automation} rows={rows} onChange={setRows} onRun={()=>void runPython()} isRunning={animating} error={editorError} optimalLines={currentLevel.optimal_code_lines} completedLines={!animating&&gameState.status==='success'&&gameState.collected.length===currentLevel.coins.length?submittedLines:null} /> : <PythonEditor config={currentLevel.python} rows={rows} onChange={setRows} onRun={() => void runPython()} isRunning={animating} error={editorError} />}

              {score && <section className="score-panel">
                <div className="score-total"><span>{currentLevel.step_limit ? '本关结算' : '本轮得分'}</span><b>{score.total_score}</b><em>/ {score.max_score??100}</em></div>
                {score.optimal_actions!==undefined
                  ? <><div className="score-parts"><span>完成 {score.collection_score}/60</span><span>行动 {score.action_score}/20</span>{mode==='python_blank'&&<span>代码 {score.code_score}/20</span>}</div><p data-track-id="score.thresholds">行动 {score.action_count} / {score.optimal_actions} 次{mode==='python_blank'&&` · 代码 ${score.code_lines??'未核验'} / ${score.optimal_code_lines} 行`}</p><p>{score.total_score===0?'完成全部目标后得 60 分。':score.total_score===60?'任务完成，减少行动次数可得 80 分。':score.total_score===80?(mode==='keyboard'?'行动次数达标，已获键盘模式最高分！':'行动次数达标，精简代码可得 100 分。'):'行动次数与代码行数均达标！'}</p></>
                  : currentLevel.step_limit
                  ? <><div className="score-parts"><span>价值 {score.collected_value} / {score.total_value}</span><span>预算 {score.steps} / {currentLevel.step_limit} 步</span></div><p>{score.collected_value === score.optimal_value ? `你拿到了预算内最高的 ${score.optimal_value} 点价值！` : `预算内最高可得 ${score.optimal_value} 点，再比较一下目标价值和绕行距离。`}</p></>
                  : <><div className="score-parts"><span>{currentLevel.robot?'目标':skin.resourceName} {score.collection_score}/60</span><span>{currentLevel.robot?'完成':'路线'} {score.route_score}/40</span></div><p>{currentLevel.show_optimal_feedback ? (score.steps === score.optimal_steps ? '你走出了最短路线！' : `最短 ${score.optimal_steps} 步，本轮 ${score.steps} 步。`) : (isFuture ? '本轮已结算，查看完成目标。' : '全部金币都已收集，操控任务完成！')}</p></>}
                {score.total_score >= (score.max_score??100)
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
      <footer><span>{isFuture ? '未来城市 · 循环挑战' : '玩家操作与时间节点已记录'}</span><span>{isFuture ? '测试操作将记录，用于任务分析' : currentLevel.step_limit ? '规则：步数用完直接结算，不设强制失败' : '规则：捡完全部金币即结束，不必返回起点'}</span></footer>
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
