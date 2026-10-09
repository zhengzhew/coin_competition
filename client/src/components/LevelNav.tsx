import type { LevelDef } from '@coin-path/shared';
import type { ReactNode } from 'react';
import './LevelNav.css';
import { cityStages } from '@coin-path/shared';
import { isFuture } from '../theme';

interface Props { levels: LevelDef[]; currentLevelId: string; onSelect: (level: LevelDef) => void; children?: ReactNode; disabled?: boolean; }

export default function LevelNav({ levels, currentLevelId, onSelect, children, disabled }: Props) {
  const robotStages=[...new Set(levels.map(level=>level.category_label??'任务'))].map(label=>{
    const indexes=levels.flatMap((level,index)=>(level.category_label??'任务')===label?[index+1]:[]);
    const first=String(indexes[0]).padStart(2,'0'),last=String(indexes[indexes.length-1]).padStart(2,'0');
    return {key:label,label,range:indexes.length===1?first:`${first}—${last}`};
  });
  const stages = levels[0]?.robot ? robotStages : [
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
      <div className="nav-heading"><span>任务地图</span><b>{levels.length} 关</b></div>
      <div className="level-groups">{stages.map((stage) => <section key={stage.key} className="stage-group">
        <div className="stage-label"><span>{isFuture && !levels[0]?.robot ? cityStages[stage.key as keyof typeof cityStages] : stage.label}</span><small>{stage.range}</small></div>
        <div className="stage-levels">
          {levels.filter((level) => levels[0]?.robot?(level.category_label??'任务')===stage.key:level.category===stage.key).map((level) =>
            <button key={level.level_id} className={`level-btn ${level.level_id === currentLevelId ? 'active' : ''}`}
              onClick={() => onSelect(level)} disabled={disabled} aria-current={level.level_id === currentLevelId ? 'page' : undefined} data-track-id={`nav.level.${level.level_id}`}
              aria-label={`${level.level_id} ${level.title}，${level.coins.length} 个${level.robot?'目标':'金币'}`}>
              <span>{String(levels.indexOf(level)+1).padStart(2,'0')}</span><strong>{level.title}</strong><small>{level.step_limit ? `${level.step_limit}步` : `${level.coins.length}${level.robot?'点':isFuture ? '芯' : '币'}`}</small>
            </button>)}
        </div>
      </section>)}</div>
      {children}
    </nav>
  );
}
