import type { ThirdCategory, ThirdDemo, ThirdSimulation } from './types.js';
import { THIRD_DIMENSIONS, THIRD_FARM_LAYOUT, thirdFarmPoint } from './geometry.js';

/** Engineering fixtures, intentionally separate from official competition content. */
export function thirdSample(category: ThirdCategory, simulation: ThirdSimulation): ThirdDemo {
  const base = {
    width: 7, depth: 6, start: { x: 1, z: 4, heading: Math.PI / 2 },
    walls: [{ x: 3, z: 2 }, { x: 4, z: 2 }],
    objects: category === 'collect'
      ? [2, 3, 4].map((x, i) => ({ id: String.fromCharCode(65 + i), x, z: 4 }))
      : [{ id: 'A', x: 2, z: 4, goal: { x: 4, z: 4 } }],
  };
  const arena = {
    width: THIRD_DIMENSIONS.map, depth: THIRD_DIMENSIONS.map, start: { x: 54, z: 96, heading: 0 },
    // Footprints match the competition props: fields, greenhouses, tanks and depot.
    walls: [{ x: 1, z: 2 }, { x: 2, z: 2 }, { x: 1, z: 3 }, { x: 2, z: 3 },
      { x: 4, z: 2 }, { x: 5, z: 2 }, { x: 8, z: 2 }, { x: 9, z: 2 },
      { x: 1, z: 7 }, { x: 2, z: 7 }, { x: 1, z: 8 }, { x: 2, z: 8 },
      { x: 12, z: 2 }, { x: 12, z: 8 }, { x: 11, z: 10 }, { x: 12, z: 10 }]
      .map(w => ({ ...thirdFarmPoint(w.x, w.z), width: THIRD_DIMENSIONS.map / THIRD_FARM_LAYOUT.width,
        depth: THIRD_DIMENSIONS.map / THIRD_FARM_LAYOUT.depth })),
    objects: category === 'collect' ? [84, 72, 60].map((z, i) => ({ id: String.fromCharCode(65 + i), x: 54, z }))
      : [{ id: 'A', x: 54, z: 83.5, goal: { x: 84, z: 84.5 } }],
  };
  return {
    competition_id: 'third', demo_id: `${category}-${simulation}-sample`, content_version: simulation === 'grid' ? 'sample-1' : 'sample-contact-3',
    category, simulation, supported_modes: ['auto', 'manual'], status: 'sample',
    title: category === 'collect' ? '能量收集' : '货物归位',
    objective: category === 'collect' ? '收集场地中的 3 枚能量。' : simulation === 'simulation3d' ? '推动或夹持 A 号货块，完整送入目标区并停稳。' : '夹取 A 号货物，放入 A 号目标区域。',
    description: simulation === 'grid' ? '逐格移动，练习路线与动作顺序。' : '连续驾驶，体验方向、距离与物体交互。',
    scene_config: simulation === 'grid' ? { ...base, kind: 'grid' }
      : { ...arena, kind: 'simulation3d', speed: 18, turnSpeed: Math.PI / 2 },
    starter: category === 'collect' ? (simulation === 'grid' ? 'forward(3)' : 'forward(36)') : simulation === 'grid' ? 'grab()\nforward(2)\nrelease()'
      : 'grab()\nforward(24)\nturn_right(90)\nforward(30)\nturn_right(90)\nrelease()',
  };
}
