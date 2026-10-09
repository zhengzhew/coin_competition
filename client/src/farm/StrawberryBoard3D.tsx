import { useEffect, useRef, useState } from 'react';
import type { ThirdSnapshot } from '@coin-path/shared';
import type { CameraView } from '../components/ThreeCityScene';
import type { StrawberryScene } from './StrawberryScene';
import StrawberryBoard from './StrawberryBoard';
import { createSaikaoRobot, type SaikaoRobot } from '../components/SaikaoRobot';
import '../components/CityBoard3D.css';

export default function StrawberryBoard3D({ state }: { state: ThirdSnapshot }) {
  const host = useRef<HTMLDivElement>(null), runtime = useRef<StrawberryScene | null>(null);
  const latest = useRef(state); latest.current = state;
  const [ready, setReady] = useState(false), [fallback, setFallback] = useState(false);
  const [view, setView] = useState<CameraView>('orbit'), [fullscreen, setFullscreen] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => {
    if (fallback || !host.current) return;
    const element = host.current; let cancelled = false;
    let model: SaikaoRobot | undefined;
    void import('./StrawberryScene').then(async ({ StrawberryScene }) => {
      if (cancelled) return;
      model = await createSaikaoRobot();
      if (cancelled) { model.dispose(); return; }
      runtime.current = new StrawberryScene(element, latest.current, setView, () => setFallback(true), model); setReady(true);
    }).catch(() => { model?.dispose(); if (!cancelled) setFallback(true); });
    return () => { cancelled = true; runtime.current?.dispose(); runtime.current = null; };
  }, [fallback]);
  useEffect(() => { runtime.current?.update(state); }, [state]);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.current?.closest<HTMLElement>('.workspace-grid')?.requestFullscreen();
      setNotice('');
    } catch { setNotice('当前窗口暂不支持全屏。'); }
  };
  const facing = ['朝上', '朝右', '朝下', '朝左'][Math.round(state.heading / (Math.PI / 2)) % 4];
  if (fallback) return <div className="farm-3d-fallback"><small role="status">当前设备暂不支持 3D，已显示平面棋盘，可继续挑战。</small><StrawberryBoard state={state} /></div>;
  return <div className="strawberry-board strawberry-board-3d">
    <div className="city3d-toolbar" aria-label="地图视角"><div className="city3d-views">
      {([['orbit', '3D 视角'], ['top', '俯视'], ['follow', '跟随']] as const).map(([id, label]) => <button key={id} disabled={!ready} aria-pressed={view === id} onClick={() => runtime.current?.setView(id)} data-track-id={`camera.view.${id}`}>{label}</button>)}
    </div><div className="city3d-tools"><button disabled={!ready} aria-label="放大地图" onClick={() => runtime.current?.zoom(.8)} data-track-id="camera.zoom.in">＋</button><button disabled={!ready} aria-label="缩小地图" onClick={() => runtime.current?.zoom(1.25)} data-track-id="camera.zoom.out">－</button><button disabled={!ready} title="恢复默认视角" onClick={() => runtime.current?.setView('orbit')} data-track-id="camera.reset">复位</button><button onClick={() => void toggleFullscreen()} data-track-id="camera.fullscreen">{fullscreen ? '退出全屏' : '全屏'}</button></div></div>
    <div className="strawberry-legend"><span><i className="edge-key" />任意边缘可交付</span><span>8 × 8 棋盘 · 坐标 0–7</span></div>
    <div className="farm-3d-stage" ref={host} data-testid="strawberry-board">{!ready && <span className="city3d-loading">正在准备农场…</span>}</div>
    <div className="strawberry-position">小车 ({state.x}, {7 - state.z}) · {facing}<span>{state.holding ? '携带 1 株 · 请到边缘放下' : '夹爪空闲'}</span></div>
    <small className="farm-3d-help">{notice || '拖动旋转 · 滚轮缩放 · 右键平移'}</small>
    <div className="city3d-accessible" role="grid" aria-label="8 乘 8 草莓棋盘" aria-rowcount={8} aria-colcount={8}>
      {Array.from({ length: 8 }, (_, z) => <div role="row" key={z}>{Array.from({ length: 8 }, (_, x) => <span key={x} role="gridcell" className="farm-grid-cell" aria-label={`坐标 (${x}, ${7 - z})${x === state.x && z === state.z ? ' 小车' : ''}${state.objects.some(o => o.x === x && o.z === z && o.id !== state.holding && !state.collected.includes(o.id)) ? ' 草莓' : ''}`} />)}</div>)}
      {state.objects.filter(o => o.id !== state.holding && !state.collected.includes(o.id)).map(o => <span key={o.id} data-testid="farm-strawberry" data-x={o.x} data-y={7 - o.z}>草莓 ({o.x}, {7 - o.z})</span>)}
      <span data-testid="farm-car" data-x={state.x} data-y={7 - state.z} data-holding={state.holding || ''}>小车 ({state.x}, {7 - state.z}) · {facing}</span>
    </div>
  </div>;
}
