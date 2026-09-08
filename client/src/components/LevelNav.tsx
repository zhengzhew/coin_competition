import type { LevelDef } from '@coin-path/shared';
import './LevelNav.css';

interface Props { levels: LevelDef[]; currentLevelId: string; onSelect: (level: LevelDef) => void; }

export default function LevelNav({ levels, currentLevelId, onSelect }: Props) {
  const stages = [
    { key: 'explore', label: '探索', range: '01—06' },
    { key: 'guided', label: '引导', range: '07—12' },
    { key: 'challenge', label: '挑战', range: '13—20' },
  ] as const;
  return (
    <nav className="level-nav" aria-label="关卡导航">
      <div className="nav-heading"><span>任务地图</span><b>20 关</b></div>
      {stages.map((stage) => <section key={stage.key} className="stage-group">
        <div className="stage-label"><span>{stage.label}</span><small>{stage.range}</small></div>
        <div className="stage-levels">
          {levels.filter((level) => level.stage === stage.key).map((level) =>
            <button key={level.level_id} className={`level-btn ${level.level_id === currentLevelId ? 'active' : ''}`}
              onClick={() => onSelect(level)} data-track-id={`nav.level.${level.level_id}`}
              aria-label={`${level.level_id} ${level.title}，${level.coins.length} 枚金币`}>
              <span>{level.level_id}</span><small>{level.coins.length}币</small>
            </button>)}
        </div>
      </section>)}
    </nav>
  );
}
