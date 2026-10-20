import type { ThirdDemo, ThirdZone } from '../third/types.js';

export const WAREHOUSE_VERSION = 'warehouse-manual-5';
export const WAREHOUSE_RULES = { cell: 12, cargo: 6, lineWidth: .6, settleSeconds: .4 } as const;
export interface WarehouseLevel extends ThirdDemo {
  requiredCount: number;
  targetScore?: number;
  strategyHint: string;
  scene_config: Extract<ThirdDemo['scene_config'], { kind: 'simulation3d' }> & {
    zones: ThirdZone[];
  };
}
const zone = (id: string, x: number, y: number, cells: number, points = 0): ThirdZone => ({
  id, x, z: 120 - y, width: cells * 12, depth: 12, points,
  color: points === 7 ? '#ce8b21' : points === 4 ? '#319581' : points === 2 ? '#518dc0' : '#2689b8',
});
// Corner cells are (12,108) and (108,108) in display coordinates.
// Classify cell centres by Euclidean radius: origin / (0,2] / (2,3] cells.
// The two mirrored families are disjoint, with a full neutral column between them.
const band = (id: string, right: boolean, points: number): ThirdZone => {
  const cells: { x: number; z: number }[] = [];
  for (let down = 0; down <= 3; down++) for (let inward = 0; inward <= 3; inward++) {
    const squared = inward ** 2 + down ** 2;
    if (points === 7 ? squared === 0 : points === 4 ? squared > 0 && squared <= 4 : squared > 4 && squared <= 9)
      cells.push({ x: right ? 108 - inward * 12 : 12 + inward * 12, z: 12 + down * 12 });
  }
  return { ...zone(id, cells[0].x, 120 - cells[0].z, 1, points), cells };
};
const scoringZones = [band('A', false, 7), band('B', true, 7), band('C', false, 4),
  band('D', true, 4), band('E', false, 2), band('F', true, 2)];
const row = (xs: number[], y = 12) => xs.map(x => ({ x, z: 120 - y }));
const configs: { objects: { x: number; z: number }[]; zones: ReturnType<typeof zone>[]; targetScore?: number; hint: string }[] = [
  { objects: row([24]), zones: [zone('A', 84, 84, 1)], hint: '先对准箱子，再观察投递区，练习抓取与放下的节奏。' },
  { objects: row([24, 96]), zones: [zone('A', 96, 108, 3)], hint: '两箱放进同一片三格区域，留出第二箱的入口和自己的退路。' },
  { objects: row([24, 60, 96]), zones: scoringZones.slice(0, 2), targetScore: 14,
    hint: '两个顶角格各得 7 分，选哪两个箱子更顺路？角落落点要对准，也要留出退车空间。' },
  { objects: row([24, 48, 72, 96]), zones: scoringZones.slice(0, 4), targetScore: 16,
    hint: '三个箱子借助顶角高分达标，或四个箱子都放 4 分区？比较路程、抓放次数与角落摆放难度。' },
  { objects: row([24, 36, 48, 72, 84, 96]), zones: scoringZones, targetScore: 20,
    hint: '7、4、2 分怎样组合到 20 分？先决定搬哪些箱子，再安排落点和顺序，避免挡住后续投递。' },
  { objects: [...row([24, 48, 72, 96]), ...row([24, 48, 72, 96], 36)], zones: scoringZones, targetScore: 30,
    hint: '目标 30 分。比较两排货物的距离、不同分数组合与摆放难度；同一得分区里也要留好入口和退路。' },
];
export const warehouseLevels: WarehouseLevel[] = configs.map((config, index) => ({
  competition_id: 'warehouse', demo_id: `warehouse-${index + 1}`, content_version: WAREHOUSE_VERSION,
  title: index < 2 ? '定点投递' : '目标达成',
  objective: config.targetScore !== undefined
    ? `${config.objects.length} 个箱子，自选搬运顺序和得分区，达到或超过 ${config.targetScore} 分立即停表。`
    : index === 0 ? '将箱子夹起并放入远处的 12 × 12 cm 投递格，停稳后完成并记录用时。'
      : '将两个箱子放进右上角同一片 36 × 12 cm 投递区，可占不同格，全部停稳后立即停表。',
  description: '不限时 · 按键驾驶 · G 夹取 / R 放下 · 完成用时越短越好',
  category: 'place', simulation: 'simulation3d', supported_modes: ['manual'], status: 'ready', starter: '',
  scene_task: 'warehouse', requiredCount: config.objects.length, targetScore: config.targetScore, strategyHint: config.hint,
  scene_config: {
    kind: 'simulation3d', width: 120, depth: 120, speed: 18, turnSpeed: Math.PI / 2,
    // Local dimensions preserve the requested centres without spawning intersecting bodies.
    robot_dimensions: { body: 17.8, gripperWidth: 14 },
    start: { x: 12, z: 108, heading: Math.PI / 2 }, walls: [], zones: config.zones,
    objects: config.objects.map((object, i) => ({ id: String(i + 1), ...object })),
  },
}));
