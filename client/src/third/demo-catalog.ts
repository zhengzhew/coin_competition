import { robotDemoManifests, type ThirdCategory, type ThirdMode, type ThirdSimulation } from '@coin-path/shared';

export const categoryLabels = { collect: '收集', place: '摆放' };
export const modeLabels = { auto: '自动', manual: '手动' };
export const simulationLabels = { grid: '棋盘模拟', simulation3d: '3D 模拟' };
export const demos = robotDemoManifests.map(entry => entry.configuration);

export interface DemoRoute { category?: ThirdCategory; mode?: ThirdMode; simulation?: ThirdSimulation; demoId?: string; invalid?: boolean; }
export function parseDemoRoute(path: string): DemoRoute {
  let parts: string[];
  try { parts = decodeURIComponent(path).replace(/\/$/, '').split('/').slice(1); } catch { return { invalid: true }; }
  const [root, category, mode, simulation, demoId] = parts;
  if (root !== 'demo' || parts.length > 5 || parts.some(part => !part) || (category && !(category in categoryLabels))
    || (mode && !(mode in modeLabels)) || (simulation && !(simulation in simulationLabels))
    || (mode && !simulation) || (demoId && !demos.some(d => d.demo_id === demoId && d.category === category && d.simulation === simulation))) return { invalid: true };
  // Membership must be own values: malformed/prototype paths must never select a mode.
  if (category && !['collect', 'place'].includes(category) || mode && !['auto', 'manual'].includes(mode)
    || simulation && !['grid', 'simulation3d'].includes(simulation)) return { invalid: true };
  return { category: category as ThirdCategory, mode: mode as ThirdMode, simulation: simulation as ThirdSimulation, demoId };
}
export function demoPath(category?: ThirdCategory, mode?: ThirdMode, simulation?: ThirdSimulation, demoId?: string) {
  return `/demo/${[category, mode, simulation, demoId].filter(Boolean).join('/')}${category ? '/' : ''}`;
}
