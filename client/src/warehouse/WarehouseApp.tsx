import { useCallback, useEffect, useRef, useState } from 'react';
import { createUuid, warehouseLevels, type WarehouseLevel } from '@coin-path/shared';
import { CompetitionWelcome } from '../components/CompetitionTemplate';
import { competitionModules } from '../competition-modules';
import WarehouseWorkspace from './WarehouseWorkspace';
import { loadWarehousePlayer, loadWarehouseRecords, warehouseRecordsKey, type WarehouseRecord } from './storage';
import '../App.css';
import '../components/GameBoard.css';
import '../components/CityBoard3D.css';
import '../components/LevelNav.css';
import '../components/RobotEditor.css';
import '../FutureCity.css';
import '../third/ThirdGame.css';
import './Warehouse.css';

export const warehousePath = (level?: WarehouseLevel) => level ? `/warehouse/${level.demo_id}/` : '/warehouse/';
export default function WarehouseApp() {
  const [path, setPath] = useState(location.pathname);
  const [player, setPlayer] = useState(loadWarehousePlayer);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState(player?.name ?? '');
  const [pendingId, setPendingId] = useState(createUuid);
  const playerId = player?.name === name.trim() ? player.id : pendingId;
  const [notice, setNotice] = useState('');
  const [records, setRecords] = useState<WarehouseRecord[]>(() => player ? loadWarehouseRecords(player.id) : []);
  const recordsRef = useRef(records); recordsRef.current = records;
  const level = warehouseLevels.find(l => path === warehousePath(l) || path === warehousePath(l).slice(0, -1));
  const home = ['/warehouse', '/warehouse/', '/warehouse/index.html'].includes(path);
  useEffect(() => {
    document.title = '智能仓储 · 手动搬运挑战';
    const pop = () => setPath(location.pathname);
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  const go = useCallback((href: string) => { history.pushState(null, '', href); setPath(href); window.scrollTo(0, 0); }, []);
  const complete = useCallback((level: WarehouseLevel, seconds: number) => {
    if (!player || !Number.isFinite(seconds) || seconds <= 0) return;
    const next = [...recordsRef.current, { id: createUuid(), levelId: level.demo_id, seconds, completedAt: new Date().toISOString() }];
    recordsRef.current = next; setRecords(next);
    try { localStorage.setItem(warehouseRecordsKey(player.id), JSON.stringify(next)); }
    catch { setNotice('本轮用时已显示，但浏览器未能保存记录。'); }
  }, [player]);
  if (confirmed && player && level) return <WarehouseWorkspace key={`${player.id}/${level.demo_id}`} level={level} player={player}
    records={records} notice={notice} go={go} onComplete={complete} />;
  return <div className="third-game-shell warehouse-shell"><div className="app future-city third-game warehouse-game competition-template competition-welcome" data-module="warehouse">
    <CompetitionWelcome module={competitionModules.warehouse} onHome={() => go(warehousePath())} footer="一箱一格 · 全部送达后提交排行榜 · 只记录完成用时">
      {!home && !level ? <section className="onboarding-card"><h2>未找到这个关卡</h2><button className="identity-confirm" onClick={() => go(warehousePath())}>返回关卡选择</button></section>
        : !confirmed ? <form className="onboarding-card" onSubmit={event => {
          event.preventDefault(); if (!name.trim()) return;
          const next = player?.name === name.trim() ? player : { id: playerId, name: name.trim() };
          setPlayer(next); const saved = loadWarehouseRecords(next.id); recordsRef.current = saved; setRecords(saved); setConfirmed(true); setPendingId(createUuid());
          try { localStorage.setItem('warehouse.player.v1', JSON.stringify(next)); }
          catch { setNotice('浏览器无法保存身份，本次仍可正常挑战。'); }
        }}><span className="eyebrow">准备出发</span><h2>今天，你是仓储驾驶员</h2><p>输入名字，开始你的搬运挑战。</p>
          <div className="identity-fields"><label htmlFor="warehouse-name">你的名字<input id="warehouse-name" maxLength={40} required autoFocus autoComplete="off" value={name} onChange={e => setName(e.target.value)} placeholder="请输入姓名或昵称" /></label><div className="identity-random-id"><span>随机 ID</span><code data-testid="player-random-id">{playerId}</code></div></div>
          <button className="identity-confirm" disabled={!name.trim()}>确认，进入仓库 →</button><small className="warehouse-local-note">成功完成后提交排行榜，用时越短排名越靠前。</small></form>
        : <section className="onboarding-card"><span className="eyebrow">{player?.name} · 选择任务</span><h2>从第一次投递，到自主规划</h2>
          <div className="experience-grid">{warehouseLevels.map((l, i) => {
            const times = records.filter(r => r.levelId === l.demo_id).map(r => r.seconds);
            return <button key={l.demo_id} onClick={() => go(warehousePath(l))}><b>0{i + 1} · {l.title}</b><small>{l.scene_config.objects.length} 箱 · {l.scene_config.zones.length} 格 · 一箱一格</small>
              <small>{times.length ? `最快 ${Math.min(...times).toFixed(2)} 秒 · 已完成 ${times.length} 次` : '等待你的第一次完成'}</small><span className="warehouse-task-enter">出发 →</span></button>;
          })}</div><button className="module-change-player" onClick={() => setConfirmed(false)}>更换玩家</button></section>}
      {notice && <p role="status">{notice}</p>}
    </CompetitionWelcome>
  </div></div>;
}
