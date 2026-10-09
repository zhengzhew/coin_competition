import { useCallback, useEffect, useRef, useState } from 'react';
import { beachLevels, createUuid, type ThirdDemo } from '@coin-path/shared';
import { CompetitionWelcome } from '../components/CompetitionTemplate';
import { competitionModules } from '../competition-modules';
import BeachWorkspace from './BeachWorkspace';
import '../App.css';
import '../components/GameBoard.css';
import '../components/CityBoard3D.css';
import '../components/LevelNav.css';
import '../components/RobotEditor.css';
import '../FutureCity.css';
import '../third/ThirdGame.css';
import './Beach.css';

interface Player { id: string; name: string }
function savedPlayer(): Player | null {
  try {
    const p = JSON.parse(localStorage.getItem('beach.player.v1') || 'null');
    return p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() ? { id: p.id, name: p.name.slice(0, 40) } : null;
  } catch { return null; }
}
export const beachPath = (level?: ThirdDemo) => level ? `/beach/${level.demo_id}/` : '/beach/';
export default function BeachApp() {
  const [path, setPath] = useState(window.location.pathname);
  const [player, setPlayer] = useState(savedPlayer), [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState(player?.name || ''), [pendingId, setPendingId] = useState(createUuid);
  const [bests, setBests] = useState<Record<string, number>>({}), [notice, setNotice] = useState('');
  const bestRef = useRef(bests);
  const playerId = player?.name === name.trim() ? player.id : pendingId;
  const isHome = ['/beach', '/beach/', '/beach/index.html'].includes(path);
  const level = beachLevels.find(item => new RegExp(`^/beach/${item.demo_id}/?$`).test(path));
  const invalid = !isHome && !level;
  useEffect(() => {
    document.title = '潮汐拾光 · 海边拾贝';
    const changed = () => setPath(window.location.pathname);
    window.addEventListener('popstate', changed); return () => window.removeEventListener('popstate', changed);
  }, []);
  useEffect(() => {
    let saved: Record<string, number> = {};
    if (player) try {
      const value = JSON.parse(localStorage.getItem(`beach.best-times.${player.id}`) || '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) saved = Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0));
    } catch { /* A malformed saved record must not block play. */ }
    bestRef.current = saved; setBests(saved);
  }, [player]);
  const go = (href: string) => { if (href !== window.location.pathname) window.history.pushState(null, '', href); setPath(window.location.pathname); window.scrollTo(0, 0); };
  const onComplete = useCallback((demo: ThirdDemo, seconds: number) => {
    if (!player || !Number.isFinite(seconds) || seconds <= 0) return;
    const key = `${demo.demo_id}.${demo.content_version}`;
    if (seconds >= (bestRef.current[key] ?? Infinity)) return;
    const next = { ...bestRef.current, [key]: seconds }; bestRef.current = next; setBests(next);
    try { localStorage.setItem(`beach.best-times.${player.id}`, JSON.stringify(next)); }
    catch { setNotice('本轮成绩已显示，但浏览器未能保存个人最佳。'); }
  }, [player]);
  if (confirmed && player && level) return <BeachWorkspace key={`${player.id}/${level.demo_id}`} demo={level} player={player} go={go}
    bests={bests} onComplete={onComplete} storageNotice={notice} />;
  return <div className="third-game-shell beach-shell"><div className="app future-city third-game beach-game competition-template competition-welcome" data-module="beach">
    <CompetitionWelcome module={competitionModules.beach} onHome={() => go(beachPath())} footer="挑战记录保存在本浏览器 · 本地评分">
      {invalid ? <section className="onboarding-card"><h2>这片沙滩还未开放</h2><p>回到岸边，重新选择拾贝任务。</p><button className="identity-confirm" onClick={() => go(beachPath())}>返回潮汐拾光</button></section>
        : !confirmed ? <form className="onboarding-card" onSubmit={event => {
          event.preventDefault(); if (!name.trim()) return;
          const next = player?.name === name.trim() ? player : { id: playerId, name: name.trim() };
          setPlayer(next); setConfirmed(true); setPendingId(createUuid());
          try { localStorage.setItem('beach.player.v1', JSON.stringify(next)); } catch { setNotice('浏览器未能保存身份，本次仍可继续挑战。'); }
        }}><span className="eyebrow">海风已至 · 准备出发</span><h2>欢迎来到潮汐拾光</h2><p>留下你的名字，开启一次海边拾贝之旅。</p>
          <div className="identity-fields"><label htmlFor="beach-name">你的名字<input id="beach-name" required autoFocus autoComplete="off" maxLength={40} value={name} placeholder="请输入姓名或昵称" onChange={event => setName(event.target.value)} /></label><div className="identity-random-id"><span>随机 ID</span><code data-testid="player-random-id">{playerId}</code></div></div>
          <button className="identity-confirm" disabled={!name.trim()}>确认，前往海边 →</button><small className="beach-local-note">完成全部交付后计分，用时越短，得分越高。</small></form>
        : <section className="onboarding-card"><span className="eyebrow">准备就绪 · {player?.name}</span><h2>选择拾贝任务</h2><p>从两枚贝壳开始，挑战更快、更稳的海边旅程。</p><div className="experience-grid">{beachLevels.map((item, i) => {
          const best = bests[`${item.demo_id}.${item.content_version}`];
          return <button key={item.demo_id} onClick={() => go(beachPath(item))}><b>0{i + 1} · {item.title}</b><small>{item.supported_modes[0] === 'auto' ? '代码操控' : '手动驾驶'} · {item.scene_config.objects.length} 个贝壳 · {best ? `最佳 ${best.toFixed(2)} 秒` : '待挑战'}</small><span className="beach-task-enter">出发 →</span></button>;
        })}</div><button className="module-change-player" onClick={() => setConfirmed(false)}>更换玩家</button>{notice && <p role="status">{notice}</p>}</section>}
    </CompetitionWelcome>
  </div></div>;
}
