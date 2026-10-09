import { competitionModules } from '../competition-modules';
import './HomePage.css';

const competitions = ['coin', 'future', 'farm', 'beach'] as const;
const artwork = {
  coin: { scene: '/assets/sand.png', symbol: '/assets/coin.png' },
  future: { scene: '/assets/future/city.svg', symbol: '/assets/future/aircar.svg' },
  farm: { scene: '/assets/farm/landscape.svg', symbol: '/assets/farm/leaf.svg' },
  beach: { scene: '/assets/beach/shoreline.svg', symbol: '/assets/beach/shell.svg' },
};

export default function HomePage() {
  return <div className="home-page">
    <header className="home-header">
      <div className="home-brand"><span className="home-brand-mark" aria-hidden="true">✦</span><div><strong>赛事首页</strong><small>探索 · 规划 · 实践</small></div></div>
      <span className="home-header-note">每一次探索，都是新的开始</span>
    </header>
    <main className="home-main">
      <section className="home-intro" aria-labelledby="home-title">
        <span className="home-eyebrow">EXPLORE & PLAY</span>
        <h1 id="home-title">下一场挑战，从这里出发。</h1>
        <p>选一个喜欢的主题，开启你的探索之旅。</p>
      </section>
      <section aria-labelledby="home-competitions-title">
        <div className="home-section-heading"><h2 id="home-competitions-title">选择赛事</h2><span>{competitions.length} 个主题 · 无限可能</span></div>
        <div className="home-competition-grid">
          {competitions.map((id, index) => {
            const module = competitionModules[id];
            return <a className={`home-card home-card-${id}`} href={module.home} key={id} aria-labelledby={`home-${id}-title`}>
              <div className="home-card-art" aria-hidden="true">
                <img className="home-card-scene" src={artwork[id].scene} alt="" />
                <span className="home-card-number">{String(index + 1).padStart(2, '0')}</span>
                <img className="home-card-symbol" src={artwork[id].symbol} alt="" />
              </div>
              <div className="home-card-copy">
                <span className="home-card-subtitle">{module.subtitle}</span>
                <h3 id={`home-${id}-title`}>{module.title}</h3>
                <p>{module.description[0]}</p>
                <div className="home-card-tags">{module.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                <div className="home-card-action"><span>进入赛事</span><span aria-hidden="true">↗</span></div>
              </div>
            </a>;
          })}
        </div>
      </section>
      <section className="home-demo-section" aria-labelledby="home-demo-title">
        <a className="home-demo" href="/demo/" aria-labelledby="home-demo-title">
          <span className="home-demo-mark" aria-hidden="true">⌘</span>
          <div className="home-demo-copy"><span className="home-eyebrow">DISCOVER MORE</span><h2 id="home-demo-title">DEMO 展示中心</h2><p>体验更多机器人玩法，探索交互计分与地图工坊。</p></div>
          <span className="home-demo-action">进入展厅 <span aria-hidden="true">↗</span></span>
        </a>
      </section>
    </main>
    <footer className="home-footer"><span>探索 · 规划 · 实践</span><span>把想法写成程序，把挑战变成收获。</span></footer>
  </div>;
}
