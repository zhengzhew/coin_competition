import { useEffect, useState } from 'react';
import type { ThirdCategory } from '@coin-path/shared';
import { categoryLabels, modeLabels, simulationLabels, demos, parseDemoRoute, demoPath } from './demo-catalog';
import DemoWorkspace from './DemoWorkspace';
import DemoHub from '../demo/DemoHub';
import './ThirdCompetition.css';

export default function ThirdCompetitionApp() {
  const [path, setPath] = useState(window.location.pathname);
  const route = parseDemoRoute(path);
  useEffect(() => {
    document.title = 'DEMO 展示中心';
    const changed = () => setPath(window.location.pathname);
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  function go(href: string) {
    window.history.pushState(null, '', href); setPath(window.location.pathname); window.scrollTo(0, 0);
  }
  if (['/demo', '/demo/', '/demo/index.html'].includes(path) || /^\/demo\/(showcase|components)(?:\/|$)/.test(path)) {
    return <DemoHub path={path} go={go} />;
  }
  const selected = route.demoId ? demos.find(d => d.demo_id === route.demoId) : undefined;
  const category = route.category;
  if (!route.invalid && selected && route.mode && selected.status !== 'planned' && selected.supported_modes.includes(route.mode)) {
    return <DemoWorkspace key={`${selected.demo_id}/${route.mode}`} demo={selected} mode={route.mode} go={go} />;
  }
  const cardArt = (kind: ThirdCategory) => <div className={`third-category-art ${kind}`} aria-hidden="true">
    <div className="art-grid" /><div className="art-robot"><i /><i /><span>↗</span></div>
    {kind === 'collect' ? <><b className="energy one">✦</b><b className="energy two">✦</b><b className="energy three">✦</b><div className="art-path" /></>
      : <><b className="art-box">A</b><b className="art-target">A</b><div className="art-arrow">→</div></>}
  </div>;
  return <div className="third-app">
    <header className="third-header">
      <a className="third-brand" href="/demo/" onClick={e => { e.preventDefault(); go('/demo/'); }}><span className="third-mark">◇</span><span><strong>DEMO 展示中心</strong><small>探索 · 编程 · 体验</small></span></a>
      <span className="third-local-badge">持续更新</span>
    </header>
    <main className={`third-main${selected ? ' is-workspace' : ''}`}>
      <nav className="third-breadcrumb" aria-label="当前位置">
        <a href="/demo/" onClick={e => { e.preventDefault(); go('/demo/'); }}>DEMO 展示中心</a>
        {category && <><span>/</span><a href={demoPath(category)} onClick={e => { e.preventDefault(); go(demoPath(category)); }}>{categoryLabels[category]}</a></>}
        {route.mode && <><span>/</span><span>{modeLabels[route.mode]}</span></>}
        {route.simulation && <><span>/</span><a href={demoPath(category, route.mode, route.simulation)} onClick={e => { e.preventDefault(); go(demoPath(category, route.mode, route.simulation)); }}>{simulationLabels[route.simulation]}</a></>}
        {selected && <><span>/</span><span aria-current="page">{selected.title}</span></>}
      </nav>
      {route.invalid ? <section className="third-empty"><h1>这个玩法暂时无法打开</h1><p>地址不完整，或对应 DEMO 尚未加入。</p><button onClick={() => go('/demo/')}>返回 DEMO 展示中心</button></section>
        : selected && route.mode && (selected.status === 'planned' || !selected.supported_modes.includes(route.mode))
          ? <section className="third-empty"><h1>DEMO 准备中</h1><p>当前操作方式尚未开放，准备好后将在这里提供。</p><button onClick={() => go(demoPath(category, route.mode, route.simulation))}>返回 DEMO 列表</button></section>
        : selected && route.mode ? <DemoWorkspace key={`${selected.demo_id}/${route.mode}`} demo={selected} mode={route.mode} go={go} />
        : !category ? <>
          <section className="third-intro"><span className="third-eyebrow">EXPLORE · CODE · PLAY</span><h1>发现新玩法，<br />从这里开始体验。</h1><p>这里汇集正在探索的互动 DEMO。选择感兴趣的主题，用程序或键盘开始体验。</p></section>
          <div className="third-categories">{(['collect', 'place'] as const).map((kind, i) => <a key={kind} href={demoPath(kind)} onClick={e => { e.preventDefault(); go(demoPath(kind)); }} className="third-category-card">
            {cardArt(kind)}<div className="third-category-copy"><span className="third-eyebrow">DEMO 0{i + 1}</span><h2>{categoryLabels[kind]}<span>↗</span></h2><p>{kind === 'collect' ? '探索路线，让每一枚能量都归队。' : '准确操控，让每一件货物各就各位。'}</p><div className="third-tags"><span>自动 / 手动</span><span>棋盘 / 3D</span></div></div>
          </a>)}</div>
          <p className="third-footnote">当前开放机器人收集与摆放 DEMO，更多主题和玩法将陆续加入。</p>
        </> : !route.mode ? <>
          <section className="third-intro compact"><span className="third-eyebrow">{category === 'collect' ? 'COLLECTION' : 'PLACEMENT'}</span><h1>{categoryLabels[category]}挑战</h1><p>选择操作方式和模拟场地，开始体验。</p></section>
          <div className="third-mode-groups">{(['auto', 'manual'] as const).map(mode => <section key={mode} className="third-mode-group"><div className="third-group-title"><span>{mode === 'auto' ? '</>' : '⌨'}</span><div><h2>{modeLabels[mode]}</h2><p>{mode === 'auto' ? '编写程序，让机器人执行你的想法' : '使用键盘，亲手驾驶机器人完成任务'}</p></div></div>
            <div className="third-sim-options">{(['grid', 'simulation3d'] as const).map(simulation => <a key={simulation} href={demoPath(category, mode, simulation)} onClick={e => { e.preventDefault(); go(demoPath(category, mode, simulation)); }}><span className={`third-sim-symbol ${simulation}`}>{simulation === 'grid' ? '▦' : '◇'}</span><strong>{simulationLabels[simulation]}</strong><small>{simulation === 'grid' ? '一步一格，清晰规划' : '连续运动，三维交互'}</small><b>选择场地 →</b></a>)}</div>
          </section>)}</div>
        </> : <>
          <section className="third-intro compact"><span className="third-eyebrow">DEMO LIBRARY</span><h1>{categoryLabels[category]} · {modeLabels[route.mode]} · {simulationLabels[route.simulation!]}</h1><p>选择一个 DEMO，体验完整的任务流程。</p></section>
          <div className="third-demo-list">{demos.filter(d => d.category === category && d.simulation === route.simulation).map(d => <article className="third-demo-card" key={d.demo_id}><span className="third-sample-tag">{d.status === 'sample' ? '功能验证样例' : d.status === 'planned' ? '准备中' : '已开放'}</span><h2>{d.title}</h2><p>{d.objective}</p><small>{d.description}</small><button disabled={d.status === 'planned' || !d.supported_modes.includes(route.mode!)} onClick={() => go(demoPath(category, route.mode, route.simulation, d.demo_id))}>进入体验 <span>→</span></button></article>)}
            <article className="third-demo-card planned"><span className="third-sample-tag">准备中</span><h2>更多玩法</h2><p>新的收集与摆放任务正在设计中。</p><small>新 DEMO 准备好后将在这里开放。</small><button disabled>DEMO 准备中</button></article></div>
        </>}
    </main>
    <footer className="third-footer"><span>DEMO 展示中心 · 持续探索</span><span>探索思路，让程序行动。</span></footer>
  </div>;
}
