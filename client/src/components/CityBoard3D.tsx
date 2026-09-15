import { useEffect, useRef, useState } from 'react';
import type { GameState, LevelDef } from '@coin-path/shared';
import ProjectedBoard from './CityBoard';
import type { CityScene, CameraView } from './ThreeCityScene';
import './CityBoard3D.css';
import RobotFallback from './RobotFallback';
import FactoryStatus from './FactoryStatus';

export default function CityBoard3D({ level, state }: { level: LevelDef; state: GameState }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<CityScene | null>(null);
  const latestState = useRef(state);
  latestState.current = state;
  const [view, setView] = useState<CameraView>('orbit');
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let cancelled = false;
    setReady(false); setView('orbit');
    void import('./ThreeCityScene').then(({ CityScene }) => {
      if (cancelled) return;
      const scene = new CityScene(element, level, latestState.current, setView, () => setFallback(true));
      runtime.current = scene;
      setReady(true);
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => { cancelled = true; runtime.current?.dispose(); runtime.current = null; };
  }, [level, fallback]);

  useEffect(() => { runtime.current?.update(state); }, [state]);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.current?.closest<HTMLElement>('.workspace-grid')?.requestFullscreen();
      setNotice('');
    } catch { setNotice('当前窗口暂不支持全屏。'); }
  };
  if (fallback) return <><small className="city3d-fallback" role="status">已切换到轻量地图</small><FactoryStatus level={level} state={state}/>{level.robot?<div className="robot-fallback-stage"><RobotFallback level={level} state={state}/><svg className="robot-map-compass" viewBox="-90 -90 180 180" role="img" aria-label="地图指南针：北、东、南、西"><circle r="86" fill="#ffffffeb" stroke="#b9d8db" strokeWidth="2"/><path d="M 0 -52 L -12 0 L 0 -10 L 12 0 Z" fill="#087b96"/><path d="M 0 52 L -12 0 L 0 10 L 12 0 Z" fill="#8b548f"/><g fill="#246c79" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="700"><text y="-70">北</text><text x="70">东</text><text y="70">南</text><text x="-70">西</text></g></svg></div>:<ProjectedBoard level={level} state={state} />}</>;

  return <div className="board-viewport city3d-viewport">
    <div className="city3d-toolbar" aria-label="地图视角">
      <div className="city3d-views">
        {([['orbit','3D 视角'],['top','俯视'],['follow','跟随']] as const).map(([id,label]) =>
          <button key={id} disabled={!ready} aria-pressed={view === id} onClick={() => runtime.current?.setView(id)} data-track-id={`camera.view.${id}`}>{label}</button>)}
      </div>
      <div className="city3d-tools">
        <button disabled={!ready} aria-label="放大地图" title="放大" onClick={() => runtime.current?.zoom(.8)} data-track-id="camera.zoom.in">＋</button>
        <button disabled={!ready} aria-label="缩小地图" title="缩小" onClick={() => runtime.current?.zoom(1.25)} data-track-id="camera.zoom.out">－</button>
        <button disabled={!ready} title="恢复默认视角" onClick={() => runtime.current?.setView('orbit')} data-track-id="camera.reset">复位</button>
        <button onClick={() => void toggleFullscreen()} data-track-id="camera.fullscreen">{fullscreen ? '退出全屏' : '全屏'}</button>
      </div>
    </div>
    <FactoryStatus level={level} state={state}/>
    <div ref={host} className="city3d-stage board-grid" data-level-id={level.level_id}>
      {!ready && <span className="city3d-loading">正在准备城市…</span>}
    </div>
    <div className="city3d-help">{notice || (level.robot?.automation?'G 拉杆 · R 复位 · 空格等待 · 每次行动推进一拍':level.robot ? 'W 前进 · S 后退 · A / D 转向 · G 夹取 · R 松开' : view === 'follow' ? '拖动旋转 · 滚轮缩放 · 按车旁箭头辨认方向' : '拖动旋转 · 滚轮缩放 · 右键平移 · 按车旁箭头辨认方向')}</div>
    <div className="city3d-accessible" role="grid" aria-label={`${level.width} 乘 ${level.height} 3D 方格地图`} aria-rowcount={level.height} aria-colcount={level.width}>
      {Array.from({length:level.height},(_,row) => { const y=level.height-row-1; return <div role="row" key={y}>
        {Array.from({length:level.width},(_,x) => { const wall=level.walls.some(([wx,wy])=>wx===x&&wy===y); const car=state.x===x&&state.y===y;
          const coin=level.coins.find(c=>c.position[0]===x&&c.position[1]===y&&!state.collected.includes(c.id));
          const dock=Object.entries(level.robot?.deliveries??{}).find(([,p])=>p[0]===x&&p[1]===y)?.[0];
          return <span role="gridcell" key={x} data-track-id={`board.cell.${x}.${y}`} data-car={car || undefined}
            aria-label={`坐标 ${x},${y}${wall ? ' 障碍' : ''}${car ? ' 飞空车' : ''}${coin ? ` ${coin.type==='checkpoint'?'巡逻点':level.robot?'货物':'能源'} ${coin.type==='checkpoint'&&!level.robot?.checkpoint_order?'':coin.id}` : ''}${dock?` 交货点 ${dock}`:''}`} />;
        })}
      </div>; })}
    </div>
  </div>;
}
