import type { ReactNode } from 'react';
import type { CompetitionModule } from '../competition-modules';
import './CompetitionTemplate.css';

export function CompetitionHeader({ module, onHome, mode, modeLabel = '当前操作方式', modeTestId, switchControl, timer, player, disabled = false }: {
  module: CompetitionModule; onHome: () => void; mode?: string; modeLabel?: string; modeTestId?: string;
  switchControl?: ReactNode; timer?: ReactNode; player?: { name: string; id?: string }; disabled?: boolean;
}) {
  return <header className="app-header module-header">
    <a className="brand" href={module.home} onClick={event => { event.preventDefault(); if (!disabled) onHome(); }} aria-disabled={disabled || undefined}><div className="brand-mark">{module.mark}</div><div><span>{module.subtitle}</span><b>{module.title}</b></div></a>
    <div className="header-mode-controls">{mode ? <div className="current-mode module-mode-notice" role="status" aria-label="当前操作模式" data-testid={modeTestId}><span>{modeLabel}</span><strong>{mode}</strong></div> : <div className="module-motto">{module.motto}</div>}{switchControl}</div>
    {player && <div className="header-actions">{timer}<div className="player-info" title={player.id} data-track-id="player.identity"><span className="online-dot" /><b>{player.name}</b></div><button className="module-home" onClick={onHome} disabled={disabled}>返回首页</button></div>}
  </header>;
}

export function CompetitionMission({ number, title, objective, children }: { number: number; title: string; objective: string; children?: ReactNode }) {
  return <div className="competition-mission-heading farm-mission-heading module-mission-heading"><span className="competition-mission-number farm-mission-number">{String(number).padStart(2, '0')}</span><h1>{title}</h1><p><span>任务目标</span><strong>{objective}</strong></p>{children}</div>;
}

export function CompetitionActions({ running, busy = false, canReset, onRun, onStop, onReset, runLabel = '▶ 运行程序', runTrack, stopTrack, testId }: {
  running: boolean; busy?: boolean; canReset: boolean; onRun: () => void; onStop: () => void; onReset: () => void;
  runLabel?: string; runTrack?: string; stopTrack?: string; testId?: string;
}) {
  return <div className="third-program-actions module-program-actions"><button className="run-btn" disabled={running || busy} onClick={onRun} data-track-id={runTrack} data-testid={testId}>{running ? '正在执行…' : busy ? '正在处理…' : runLabel}</button><button className="secondary-action third-stop" disabled={canReset ? busy : !running} onClick={canReset ? onReset : onStop} data-track-id={canReset ? 'attempt.reset' : stopTrack} data-testid="competition-stop-reset">{canReset ? '重置' : '停止'}</button></div>;
}

export function CompetitionWelcome({ module, onHome, children, footer }: { module: CompetitionModule; onHome: () => void; children: ReactNode; footer: string }) {
  return <><CompetitionHeader module={module} onHome={onHome} /><main className="module-welcome-body"><section className="module-intro"><span className="eyebrow">{module.eyebrow}</span><h1>{module.headline[0]}<br />{module.headline[1]}</h1><p>{module.description[0]}<br />{module.description[1]}</p><div className="module-feature-tags">{module.tags.map(tag => <span key={tag}>{tag}</span>)}</div></section>{children}</main><footer><span>{module.title} · 观察 · 规划 · 实践</span><span>{footer}</span></footer></>;
}
