import { thirdSample, type ThirdCategory, type ThirdMode, type ThirdSimulation } from '@coin-path/shared';

export const categoryLabels = { collect: '收集', place: '摆放' };
export const modeLabels = { auto: '自动', manual: '手动' };
export const simulationLabels = { grid: '棋盘模拟', simulation3d: '3D 模拟' };
export const demos = (['collect', 'place'] as const).flatMap(category =>
  (['grid', 'simulation3d'] as const).map(simulation => thirdSample(category, simulation)));

export interface ThirdRoute { category?: ThirdCategory; mode?: ThirdMode; simulation?: ThirdSimulation; demoId?: string; invalid?: boolean; }
export function parseThirdRoute(path: string): ThirdRoute {
  let parts: string[];
  try { parts = decodeURIComponent(path).replace(/\/$/, '').split('/').slice(1); } catch { return { invalid: true }; }
  const [root, category, mode, simulation, demoId] = parts;
  if (root !== 'third' || parts.length > 5 || parts.some(part => !part) || (category && !(category in categoryLabels))
    || (mode && !(mode in modeLabels)) || (simulation && !(simulation in simulationLabels))
    || (mode && !simulation) || (demoId && !demos.some(d => d.demo_id === demoId && d.category === category && d.simulation === simulation))) return { invalid: true };
  // Membership must be own values: malformed/prototype paths must never select a mode.
  if (category && !['collect', 'place'].includes(category) || mode && !['auto', 'manual'].includes(mode)
    || simulation && !['grid', 'simulation3d'].includes(simulation)) return { invalid: true };
  return { category: category as ThirdCategory, mode: mode as ThirdMode, simulation: simulation as ThirdSimulation, demoId };
}
export function thirdPath(category?: ThirdCategory, mode?: ThirdMode, simulation?: ThirdSimulation, demoId?: string) {
  return `/third/${[category, mode, simulation, demoId].filter(Boolean).join('/')}${category ? '/' : ''}`;
}
