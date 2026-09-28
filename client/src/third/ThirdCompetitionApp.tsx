import { useEffect, useState } from 'react';
import type { ThirdCategory } from '@coin-path/shared';
import { categoryLabels, modeLabels, simulationLabels, demos, parseThirdRoute, thirdPath } from './demo-catalog';
import DemoWorkspace from './DemoWorkspace';
import './ThirdCompetition.css';

export default function ThirdCompetitionApp() {
  const [path, setPath] = useState(window.location.pathname);
  const route = parseThirdRoute(path);
  useEffect(() => {
    document.title = '第三子赛项 · 机器人实验场';
    const changed = () => setPath(window.location.pathname);
    window.addEventListener('popstate', changed);
    return () => window.removeEventListener('popstate', changed);
  }, []);
  function go(href: string) {
    window.history.pushState(null, '', href); setPath(window.location.pathname); window.scrollTo(0, 0);
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
      <a className="third-brand" href="/third/" onClick={e => { e.preventDefault(); go('/third/'); }}><span className="third-mark">Ⅲ</span><span><strong>第三子赛项</strong><small>机器人实验场</small></span></a>
      <nav aria-label="赛项导航"><a href="/">旷野淘金</a><a href="/future/">未来城市</a><span className="third-local-badge">基础试用版</span></nav>
    </header>
    <main className={`third-main${selected ? ' is-workspace' : ''}`}>
      <nav className="third-breadcrumb" aria-label="当前位置">
        <a href="/third/" onClick={e => { e.preventDefault(); go('/third/'); }}>第三子赛项</a>
        {category && <><span>/</span><a href={thirdPath(category)} onClick={e => { e.preventDefault(); go(thirdPath(category)); }}>{categoryLabels[category]}</a></>}
        {route.mode && <><span>/</span><span>{modeLabels[route.mode]}</span></>}
        {route.simulation && <><span>/</span><a href={thirdPath(category, route.mode, route.simulation)} onClick={e => { e.preventDefault(); go(thirdPath(category, route.mode, route.simulation)); }}>{simulationLabels[route.simulation]}</a></>}
        {selected && <><span>/</span><span aria-current="page">{selected.title}</span></>}
      </nav>
      {route.invalid ? <section className="third-empty"><h1>这个玩法暂时无法打开</h1><p>地址不完整，或对应 DEMO 尚未加入。</p><button onClick={() => go('/third/')}>返回第三子赛项</button></section>
        : selected && route.mode && (selected.status === 'planned' || !selected.supported_modes.includes(route.mode))
          ? <section className="third-empty"><h1>DEMO 准备中</h1><p>当前操作方式尚未开放，准备好后将在这里提供。</p><button onClick={() => go(thirdPath(category, route.mode, route.simulation))}>返回 DEMO 列表</button></section>
        : selected && route.mode ? <DemoWorkspace key={`${selected.demo_id}/${route.mode}`} demo={selected} mode={route.mode} go={go} />
        : !category ? <>
          <section className="third-intro"><span className="third-eyebrow">EXPLORE · CODE · PLAY</span><h1>从一个动作，<br />开始你的机器人挑战。</h1><p>先选择任务，再用程序或键盘，在棋盘与三维场地中探索。</p></section>
          <div className="third-categories">{(['collect', 'place'] as const).map((kind, i) => <a key={kind} href={thirdPath(kind)} onClick={e => { e.preventDefault(); go(thirdPath(kind)); }} className="third-category-card">
            {cardArt(kind)}<div className="third-category-copy"><span className="third-eyebrow">CHALLENGE 0{i + 1}</span><h2>{categoryLabels[kind]}<span>↗</span></h2><p>{kind === 'collect' ? '探索路线，让每一枚能量都归队。' : '准确操控，让每一件货物各就各位。'}</p><div className="third-tags"><span>自动 / 手动</span><span>棋盘 / 3D</span></div></div>
          </a>)}</div>
          <p className="third-footnote">当前开放功能验证样例。正式玩法 DEMO 将陆续加入。</p>
        </> : !route.mode ? <>
          <section className="third-intro compact"><span className="third-eyebrow">{category === 'collect' ? 'COLLECTION' : 'PLACEMENT'}</span><h1>{categoryLabels[category]}挑战</h1><p>选择操作方式和模拟场地，开始体验。</p></section>
          <div className="third-mode-groups">{(['auto', 'manual'] as const).map(mode => <section key={mode} className="third-mode-group"><div className="third-group-title"><span>{mode === 'auto' ? '</>' : '⌨'}</span><div><h2>{modeLabels[mode]}</h2><p>{mode === 'auto' ? '编写程序，让机器人执行你的想法' : '使用键盘，亲手驾驶机器人完成任务'}</p></div></div>
            <div className="third-sim-options">{(['grid', 'simulation3d'] as const).map(simulation => <a key={simulation} href={thirdPath(category, mode, simulation)} onClick={e => { e.preventDefault(); go(thirdPath(category, mode, simulation)); }}><span className={`third-sim-symbol ${simulation}`}>{simulation === 'grid' ? '▦' : '◇'}</span><strong>{simulationLabels[simulation]}</strong><small>{simulation === 'grid' ? '一步一格，清晰规划' : '连续运动，三维交互'}</small><b>选择场地 →</b></a>)}</div>
          </section>)}</div>
        </> : <>
          <section className="third-intro compact"><span className="third-eyebrow">DEMO LIBRARY</span><h1>{categoryLabels[category]} · {modeLabels[route.mode]} · {simulationLabels[route.simulation!]}</h1><p>选择一个 DEMO，体验完整的任务流程。</p></section>
          <div className="third-demo-list">{demos.filter(d => d.category === category && d.simulation === route.simulation).map(d => <article className="third-demo-card" key={d.demo_id}><span className="third-sample-tag">{d.status === 'sample' ? '功能验证样例' : d.status === 'planned' ? '准备中' : '已开放'}</span><h2>{d.title}</h2><p>{d.objective}</p><small>{d.description}</small><button disabled={d.status === 'planned' || !d.supported_modes.includes(route.mode!)} onClick={() => go(thirdPath(category, route.mode, route.simulation, d.demo_id))}>进入体验 <span>→</span></button></article>)}
            <article className="third-demo-card planned"><span className="third-sample-tag">准备中</span><h2>更多玩法</h2><p>新的收集与摆放任务正在设计中。</p><small>正式 DEMO 准备好后将在这里开放。</small><button disabled>DEMO 准备中</button></article></div>
        </>}
    </main>
    <footer className="third-footer"><span>第三子赛项 · 收集与摆放</span><span>探索思路，让程序行动。</span></footer>
  </div>;
}
