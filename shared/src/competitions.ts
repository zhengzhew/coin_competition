import type { LevelDef } from './types.js';

export type Competition = 'coin' | 'future';
export const competitionForAssignment = (key: string): Competition => key.startsWith('F') ? 'future' : 'coin';
export const levelIdForAssignment = (key: string) => `${key.startsWith('F') ? 'FL' : 'L'}${key.slice(-2)}`;

const cityTitles = [
  '飞空车出发', '云端充能', '街区巡航', '信标连线', '空港接力',
  '直达能源站', '最短航线', '霓虹街角', '穿越云环', '双塔之间',
  '城市漫游', '绕过高楼', '天际穿行', '空中走廊', '都市领航员',
  '限程巡航', '能源调度', '航程挑战', '超级能源芯', '点亮未来城',
];
export const cityStages: Record<string, string> = {
  intro: '试飞启航', ordered: '信标接力', optimal_guided: '航线训练',
  optimal_free: '自主巡航', obstacle_guided: '避障训练', obstacle_free: '穿越都市', budget: '能源调度',
};

/** Only presentation and identifiers change. Geometry, commands and scoring stay identical. */
export function futureLevel(level: LevelDef, index: number): LevelDef {
  const budget = level.step_limit;
  return {
    ...level, level_id: `F${level.level_id}`, keyboard_id: `F${level.keyboard_id}`, python_id: `F${level.python_id}`,
    content_id: `future_${level.level_id.toLowerCase()}`, content_version: 'future-city-1.0.0',
    title: cityTitles[index] ?? level.title,
    category_label: cityStages[level.category ?? 'intro'],
    objective: budget ? `在 ${budget} 步内，收集更多能源。`
      : level.required_order ? '按编号依次收集能源芯。'
      : level.show_optimal_feedback ? '用更短航线，收集全部能源芯。' : '驾驶飞空车，收集全部能源芯。',
    rule_hint: budget ? (level.coins.some(c => c.type === 'chest') ? '普通芯 1 点 · 超级芯 3 点；步数用完即结算。' : '每枚能源芯 1 点，步数用完即结算。')
      : level.walls.length ? '高楼不可穿越；收集完成即结束。' : '收集完成即结束，无需返航。',
    knowledge: level.knowledge.replaceAll('金币箱', '超级能源芯').replaceAll('金币', '能源芯').replaceAll('小车', '飞空车'),
  };
}
