import type { LevelDef } from '@coin-path/shared';
import './LevelNav.css';

interface Props { levels: LevelDef[]; currentLevelId: string; onSelect: (level: LevelDef) => void; }

export default function LevelNav({ levels, currentLevelId, onSelect }: Props) {
  const stages = [
    { key: 'intro', label: '操控入门', range: '01—03' },
    { key: 'ordered', label: '顺序收集', range: '04—05' },
    { key: 'optimal_guided', label: '最短教学', range: '06—07' },
    { key: 'optimal_free', label: '自主寻路', range: '08—11' },
    { key: 'obstacle_guided', label: '绕障教学', range: '12' },
    { key: 'obstacle_free', label: '绕障练习', range: '13—15' },
    { key: 'budget', label: '步数预算', range: '16—20' },
  ] as const;
  return (
    <nav className="level-nav" aria-label="关卡导航">
      <div className="nav-heading"><span>任务地图</span><b>20 关</b></div>
      {stages.map((stage) => <section key={stage.key} className="stage-group">
        <div className="stage-label"><span>{stage.label}</span><small>{stage.range}</small></div>
        <div className="stage-levels">
          {levels.filter((level) => level.category === stage.key).map((level) =>
            <button key={level.level_id} className={`level-btn ${level.level_id === currentLevelId ? 'active' : ''}`}
              onClick={() => onSelect(level)} data-track-id={`nav.level.${level.level_id}`}
              aria-label={`${level.level_id} ${level.title}，${level.coins.length} 枚金币`}>
              <span>{level.level_id}</span><small>{level.step_limit ? `${level.step_limit}步` : `${level.coins.length}币`}</small>
            </button>)}
        </div>
      </section>)}
    </nav>
  );
}
