import { useCallback, useEffect, useRef, useState } from 'react';
import { createUuid, type ThirdDemo } from '@coin-path/shared';
import FarmGridWorkspace from './FarmGridWorkspace';
import { farmLevels, farmModeLabels, farmPath, parseFarmRoute } from './catalog';
import './Farm.css';
import { CompetitionWelcome } from '../components/CompetitionTemplate';
import { competitionModules } from '../competition-modules';

interface Farmer { id: string; name: string }
function savedFarmer(): Farmer | null {
  try {
    const value = JSON.parse(localStorage.getItem('farm.player.v1') || 'null');
    return value && typeof value.id === 'string' && typeof value.name === 'string' && value.name.trim()
      ? { id: value.id, name: value.name.slice(0, 40) } : null;
  } catch { return null; }
}

export default function FarmApp() {
  const [path, setPath] = useState(window.location.pathname);
  const [farmer, setFarmer] = useState(savedFarmer);
  const [name, setName] = useState(farmer?.name || '');
  const [pendingPlayerId, setPendingPlayerId] = useState(createUuid);
  const previewPlayerId = farmer?.name === name.trim() ? farmer.id : pendingPlayerId;
  const [confirmed, setConfirmed] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const completedRef = useRef(completed);
  const [bests, setBests] = useState<Record<string, number>>({});
  const bestsRef = useRef(bests);
  const { isTask, level, invalid } = parseFarmRoute(path);
  const mode = level.control_mode;
  useEffect(() => {
    document.title = '生态农场 · 机器人挑战';
    const changed = () => setPath(window.location.pathname);
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  useEffect(() => {
    if (!isTask || invalid || path === farmPath(level)) return;
    window.history.replaceState(null, '', farmPath(level));
    setPath(window.location.pathname);
  }, [isTask, invalid, level, path]);
  useEffect(() => {
    if (!farmer) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`farm.progress.${farmer.id}`) || '{}');
      completedRef.current = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch { completedRef.current = {}; }
    setCompleted(completedRef.current);
    try {
      const saved = JSON.parse(localStorage.getItem(`farm.best-steps.${farmer.id}`) || '{}');
      bestsRef.current = saved && typeof saved === 'object' && !Array.isArray(saved)
        ? Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, number] => Number.isSafeInteger(entry[1]) && (entry[1] as number) >= 0)) : {};
    } catch { bestsRef.current = {}; }
    setBests(bestsRef.current);
  }, [farmer]);
  const go = (href: string) => {
    if (href !== window.location.pathname) window.history.pushState(null, '', href);
    setPath(window.location.pathname); window.scrollTo(0, 0);
  };
  const onComplete = useCallback((finished: ThirdDemo, steps: number) => {
    const configured = farmLevels.find(item => item.demo_id === finished.demo_id);
    if (!farmer || !configured) return;
    const key = `${configured.control_mode}.${finished.demo_id}`;
    const bestKey = `${finished.demo_id}.${finished.content_version}`;
    if (steps < (bestsRef.current[bestKey] ?? Infinity)) {
      const nextBests = { ...bestsRef.current, [bestKey]: steps };
      bestsRef.current = nextBests; setBests(nextBests);
      try { localStorage.setItem(`farm.best-steps.${farmer.id}`, JSON.stringify(nextBests)); }
      catch { setStorageNotice('浏览器未能保存最佳步数；本次仍可继续挑战。'); }
    }
    if (completedRef.current[key]) return;
    const next = { ...completedRef.current, [key]: true };
    completedRef.current = next; setCompleted(next);
    try { localStorage.setItem(`farm.progress.${farmer.id}`, JSON.stringify(next)); }
    catch { setStorageNotice('浏览器未能保存进度；本次仍可继续挑战。'); }
  }, [farmer]);

  if (!invalid && confirmed && farmer && isTask) return <FarmGridWorkspace key={`${farmer.id}/${level.demo_id}/${mode}`}
    demo={level} go={go} player={farmer} storageNotice={storageNotice}
    bestSteps={bests[`${level.demo_id}.${level.content_version}`]}
    isCompleted={item => !!completed[`auto.${item.demo_id}`]} onComplete={onComplete} />;

  return <div className="third-game-shell farm-shell"><div className="app future-city third-game farm-game farm-welcome competition-template competition-welcome" data-module="farm">
    <CompetitionWelcome module={competitionModules.farm} onHome={() => go(farmPath())} footer="挑战进度保存在本浏览器 · 本地评分">
      {invalid ? <section className="onboarding-card"><h2>没有找到这个农场任务</h2><p>请回到生态农场，重新选择任务。</p><button className="identity-confirm" onClick={() => go(farmPath())}>返回生态农场</button></section>
        : !confirmed ? <form className="onboarding-card" aria-labelledby="farm-identity-heading" onSubmit={event => {
          event.preventDefault(); if (!name.trim()) return;
          const next = farmer?.name === name.trim() ? farmer : { id: previewPlayerId, name: name.trim() };
          setFarmer(next); setConfirmed(true);
          setPendingPlayerId(createUuid());
          try { localStorage.setItem('farm.player.v1', JSON.stringify(next)); }
          catch { setStorageNotice('浏览器未能保存身份；本次仍可继续挑战。'); }
        }}><span className="eyebrow">开始挑战前</span><h2 id="farm-identity-heading">欢迎来到生态农场</h2><p>告诉我们你的名字，准备出发吧。</p><div className="identity-fields"><label htmlFor="farmer-name">你的名字<input id="farmer-name" autoFocus required maxLength={40} autoComplete="off" placeholder="请输入姓名或昵称" value={name} onChange={event => setName(event.target.value)} /></label><div className="identity-random-id"><span>随机 ID</span><code data-testid="player-random-id">{previewPlayerId}</code></div></div><button className="identity-confirm" type="submit" disabled={!name.trim()}>确认，进入农场 →</button><small className="farm-local-note">挑战进度保存在当前浏览器，暂不计正式比赛成绩。</small></form>
        : <section className="onboarding-card" aria-labelledby="farm-task-heading"><span className="eyebrow">准备就绪 · {farmer?.name}</span><h2 id="farm-task-heading">选择农场任务</h2><p>每关的操作方式已指定，进入后查看顶栏提示。</p><div className="experience-grid">{farmLevels.map(item => <button key={item.demo_id} onClick={() => go(farmPath(item))}><b>{item.title}</b><small>{farmModeLabels[item.control_mode]} · {completed[`${item.control_mode}.${item.demo_id}`] ? '已完成' : '待挑战'}</small><span className="farm-task-enter" aria-hidden="true">进入 →</span></button>)}</div><button className="farm-change-player" onClick={() => setConfirmed(false)}>更换玩家</button>{storageNotice && <p role="status">{storageNotice}</p>}</section>}
    </CompetitionWelcome>
  </div></div>;
}
