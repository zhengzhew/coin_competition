import { lazy, Suspense, type ComponentType } from 'react';
import type { DemoManifest, RobotScenario, ThirdMode } from '@coin-path/shared';
import { demoPath } from '../third/demo-catalog';
import ScorePlayground from './ScorePlayground';

const MapEditor = lazy(() => import('../MapEditor'));

export interface DemoRendererProps { demo: DemoManifest; go: (path: string) => void }
function MapEditorExperience({ demo }: DemoRendererProps) {
  const configuration = demo.configuration as { embedded: boolean };
  return <div className="demo-map-editor"><div className="demo-editor-intro"><p>绘制旷野淘金与未来城市的棋盘地图，检查后直接试走。草稿保存在本机，可导出 JSON 复用。</p><a href="/editor/">独立打开编辑器 ↗</a></div><Suspense fallback={<section className="demo-panel" role="status">正在打开地图编辑器…</section>}><MapEditor embedded={configuration.embedded} /></Suspense></div>;
}
function RobotLauncher({ demo, go }: DemoRendererProps) {
  const scenario = demo.configuration as RobotScenario;
  return <section className="demo-panel"><h2>选择体验方式</h2><p>{demo.summary}</p><div className="demo-launch-options">{scenario.supported_modes.map(mode => {
    const href = demoPath(scenario.category, mode as ThirdMode, scenario.simulation, scenario.demo_id);
    return <a key={mode} href={href} onClick={e => { e.preventDefault(); go(href); }}><span>{mode === 'auto' ? '</>' : '⌨'}</span><strong>{mode === 'auto' ? '自动 · 程序控制' : '手动 · 键盘控制'}</strong><small>进入后操作方式固定 →</small></a>;
  })}</div><p className="demo-muted">通过同一运行组件体验不同任务；本示例不计正式比赛成绩。</p></section>;
}
export const demoRenderers: Record<string, ComponentType<DemoRendererProps>> = { robot: RobotLauncher, scoring: ScorePlayground, 'map-editor': MapEditorExperience };
