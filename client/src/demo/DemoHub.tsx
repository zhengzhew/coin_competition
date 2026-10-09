import { useState } from 'react';
import { demoManifests, gameplayComponents, competitionComponentBindings, exportDemoPreset, type DemoManifest } from '@coin-path/shared';
import { detailTabs, parseHubRoute, showcasePath } from './route';
import { demoRenderers } from './renderers';
import { downloadConfiguration } from './download';
import './DemoHub.css';

const modeLabels: Record<string, string> = { auto: '自动', manual: '手动', interactive: '交互体验' };
const statusLabels = { sample: '验证样例', ready: '已开放', planned: '准备中' };
export default function DemoHub({ path, go }: { path: string; go: (path: string) => void }) {
  const route = parseHubRoute(path);
  const [search, setSearch] = useState(''), [topic, setTopic] = useState(''), [form, setForm] = useState(''), [mode, setMode] = useState(''), [status, setStatus] = useState(''), [component, setComponent] = useState('');
  const selected = demoManifests.find(d => d.id === route.id);
  const link = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); go(href); };
  const filtered = demoManifests.filter(d => (!topic || d.topic === topic) && (!form || d.form === form) && (!mode || d.modes.includes(mode)) && (!status || d.status === status)
    && (!component || d.dependencies.some(dep => dep.id === component)) && `${d.title} ${d.summary} ${d.tags.join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  const consumers = (id: string, version: string) => competitionComponentBindings.filter(b => b.component.id === id && b.component.version === version);
  const dependencies = (demo: DemoManifest) => demo.dependencies.map(ref => gameplayComponents.find(c => c.id === ref.id && c.version === ref.version)!);
  const invalid = route.kind === 'invalid' || route.kind === 'detail' && !selected;
  const Renderer = selected && Object.hasOwn(demoRenderers, selected.renderer) ? demoRenderers[selected.renderer] : undefined;
  return <div className="third-app demo-hub">
    <header className="third-header"><a className="third-brand" href="/demo/" onClick={link('/demo/')}><span className="third-mark">◇</span><span><strong>DEMO 展示中心</strong><small>玩法 · 规则 · 共享能力</small></span></a><nav aria-label="页面导航"><a href="/">旷野淘金</a><a href="/future/">未来城市</a><a href="/farm/">生态农场</a></nav></header>
    <main className="demo-main">
      <nav className="demo-primary-nav" aria-label="展示中心导航"><a href="/demo/" onClick={link('/demo/')} aria-current={route.kind === 'home' ? 'page' : undefined}>玩法展厅 <span>{demoManifests.length}</span></a><a href="/demo/components/" onClick={link('/demo/components/')} aria-current={route.kind === 'components' ? 'page' : undefined}>组件库 <span>{gameplayComponents.length}</span></a></nav>
      {invalid ? <section className="third-empty"><h1>这个 DEMO 暂时无法打开</h1><p>请检查地址，或回到展厅选择其他内容。</p><a href="/demo/" onClick={link('/demo/')}>返回玩法展厅 →</a></section>
      : route.kind === 'home' ? <>
        <section className="demo-hero"><div><span className="third-eyebrow">EXPLORE · BUILD · REUSE</span><h1>发现新玩法，<br />从这里开始体验。</h1><p>体验规则，验证想法。让每一次探索，都成为下一场比赛可以复用的能力。</p></div><div className="demo-hero-note"><b>从演示走向比赛</b><span>玩法体验 → 共享组件 → 赛事实例</span><small>同一份能力代码，不同的地图与规则配置。</small></div></section>
        <section className="demo-filters" aria-label="DEMO 筛选"><label className="demo-search">搜索<input type="search" placeholder="搜索玩法、规则或能力" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <label>主题<select aria-label="主题" value={topic} onChange={e => setTopic(e.target.value)}><option value="">全部主题</option>{[...new Set(demoManifests.map(d => d.topic))].map(v => <option key={v}>{v}</option>)}</select></label>
          <label>形式<select aria-label="形式" value={form} onChange={e => setForm(e.target.value)}><option value="">全部形式</option>{[...new Set(demoManifests.map(d => d.form))].map(v => <option key={v}>{v}</option>)}</select></label>
          <label>操作<select aria-label="操作" value={mode} onChange={e => setMode(e.target.value)}><option value="">全部操作</option>{[...new Set(demoManifests.flatMap(d => d.modes))].map(v => <option key={v} value={v}>{modeLabels[v] || v}</option>)}</select></label>
          <label>成熟度<select aria-label="成熟度" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(statusLabels).map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>
          <label>组件<select aria-label="组件" value={component} onChange={e => setComponent(e.target.value)}><option value="">全部组件</option>{gameplayComponents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></section>
        <div className="demo-list-heading"><span aria-live="polite">共 {filtered.length} 个 DEMO</span><div><a href="/demo/collect/" onClick={link('/demo/collect/')}>收集系列</a><a href="/demo/place/" onClick={link('/demo/place/')}>摆放系列</a></div></div>
        <div className="demo-card-grid">{filtered.map(d => <a className={`demo-card renderer-${d.renderer}`} data-demo-id={d.id} key={d.id} href={showcasePath(d.id)} onClick={link(showcasePath(d.id))}>
          <div className="demo-card-art" aria-hidden="true">{d.renderer === 'map-editor' ? <><b>▦</b><span>绘制 · 试走 · 导出</span></> : d.renderer === 'scoring' ? <><b>60</b><span>+</span><b>20</b><span>+</span><b>20</b></> : <><span className="demo-art-route">┄┄</span><b>{d.tags.includes('摆放') ? '▧' : '✦'}</b><span className="demo-art-robot">↗</span></>}</div>
          <div className="demo-card-copy"><div className="demo-card-top"><span>{d.topic} / {d.form}</span><small>{statusLabels[d.status]}</small></div><h2>{d.title}</h2><p>{d.summary}</p><div className="third-tags">{d.tags.map(t => <span key={t}>{t}</span>)}</div><footer><span>{d.modes.map(m => modeLabels[m] || m).join(' / ')}</span><b>查看体验 →</b></footer></div></a>)}</div>
        {!filtered.length && <section className="third-empty"><h2>没有匹配的 DEMO</h2><button onClick={() => { setSearch(''); setTopic(''); setForm(''); setMode(''); setStatus(''); setComponent(''); }}>清空筛选</button></section>}
      </> : route.kind === 'components' ? <>
        <section className="demo-section-heading"><span className="third-eyebrow">SHARED CAPABILITIES</span><h1>组件库</h1><p>从运行中的 DEMO 找到可复用能力，查看接入方式和实际使用它的赛事。</p></section>
        <div className="demo-component-grid">{gameplayComponents.map(c => <article className="demo-panel" key={c.id}><div className="demo-card-top"><span>{c.id}</span><small>{c.status === 'released' ? `已发布 ${c.version}` : '开发中'}</small></div><h2>{c.name}</h2><p>{c.description}</p><code className="demo-contract">{c.contract}</code><h3>体验示例</h3><div className="demo-related">{demoManifests.filter(d => d.dependencies.some(dep => dep.id === c.id && dep.version === c.version)).map(d => <a key={d.id} href={showcasePath(d.id)} onClick={link(showcasePath(d.id))}>{d.title} ↗</a>)}</div><h3>赛事使用</h3>{consumers(c.id, c.version).map(b => <p key={b.id}><a href={b.href}>{b.competition} ↗</a> · {b.usage}</p>)}<ul>{c.limitations.map(l => <li key={l}>{l}</li>)}</ul></article>)}</div>
      </> : selected ? <>
        <div className="third-breadcrumb"><a href="/demo/" onClick={link('/demo/')}>玩法展厅</a><span>/</span><span>{selected.title}</span></div>
        <section className="demo-section-heading"><span className="third-eyebrow">{selected.topic} · {selected.form}</span><h1>{selected.title}</h1><p>{selected.summary}</p></section>
        <nav className="demo-detail-tabs" aria-label="DEMO 详情">{Object.entries(detailTabs).map(([tab, label]) => <a key={tab} href={showcasePath(selected.id, tab as keyof typeof detailTabs)} onClick={link(showcasePath(selected.id, tab as keyof typeof detailTabs))} aria-current={route.tab === tab ? 'page' : undefined}>{label}</a>)}</nav>
        {route.tab === 'experience' ? selected.status === 'planned' ? <section className="demo-panel"><h2>DEMO 准备中</h2></section> : Renderer ? <Renderer key={selected.id} demo={selected} go={go} /> : <section className="demo-panel"><p>该体验方式尚未接入。</p></section>
          : route.tab === 'rules' ? <section className="demo-panel demo-rules"><h2>玩法规则</h2><dl>{([['目标', 'goal'], ['操作', 'operation'], ['完成条件', 'success'], ['停止与重试', 'failure'], ['计分', 'scoring']] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{selected.rules[key]}</dd></div>)}</dl><h3>边界情况</h3><ul>{selected.rules.boundaries.map(t => <li key={t}>{t}</li>)}</ul></section>
          : route.tab === 'technology' ? <div className="demo-tech-grid"><section className="demo-panel"><h2>组成能力</h2>{dependencies(selected).map(c => <div className="demo-dependency" key={c.id}><h3>{c.name} <small>{c.version}</small></h3><p>{c.description}</p><code>{c.source}</code></div>)}<h3>可配置参数</h3><ul>{selected.technology.parameters.map(p => <li key={p}>{p}</li>)}</ul><p><b>输入：</b>{selected.technology.inputs}</p><p><b>输出：</b>{selected.technology.outputs}</p></section><section className="demo-panel"><h2>最小接入示例</h2><pre><code>{selected.technology.example}</code></pre><h3>适用范围</h3><ul>{selected.technology.limitations.map(p => <li key={p}>{p}</li>)}</ul></section></div>
          : <section className="demo-panel"><h2>版本与复用</h2><p>内容版本：<b>{selected.contentVersion}</b></p>{dependencies(selected).map(c => <div className="demo-dependency" key={c.id}><h3>{c.name} · {c.version}</h3><p>{c.status === 'released' ? '固定版本源码与指纹校验；新规则通过新增版本发布，赛事显式选择升级。' : '此能力仍在开发，尚未提供正式赛事的版本隔离。'}</p><h4>使用该组件的赛事</h4>{consumers(c.id, c.version).length ? consumers(c.id, c.version).map(b => <p key={b.id}><a href={b.href}>{b.competition} ↗</a> · {b.usage} · 配置 {b.configuration}</p>) : <p>暂无赛事实例。</p>}</div>)}<p>{selected.technology.exportNote ?? '下载配置后，在项目中引用对应组件并载入配置；此操作不会修改任何赛事。'}</p><button onClick={() => downloadConfiguration(selected.id, exportDemoPreset(selected))}>下载示例配置</button></section>}
      </> : null}
    </main><footer className="third-footer"><span>DEMO 展示中心 · 让想法成为可复用的能力</span><span>体验 · 验证 · 复用</span></footer>
  </div>;
}
