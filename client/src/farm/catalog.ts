import { strawberryLevels, type ThirdDemo, type ThirdMode } from '@coin-path/shared';

export interface FarmLevel extends ThirdDemo { control_mode: ThirdMode }
export const farmModeLabels: Record<ThirdMode, string> = { manual: '手动操作', auto: '编程控制' };

export const farmLevels: FarmLevel[] = strawberryLevels.map(level => ({ ...level, control_mode: 'auto' }));

export const farmPath = (level?: Pick<ThirdDemo, 'demo_id'>) => level ? `/farm/${level.demo_id}/` : '/farm/';
export function parseFarmRoute(path: string): { isTask?: boolean; level: FarmLevel; invalid?: boolean } {
  if (['/farm', '/farm/', '/farm/index.html'].includes(path)) return { level: farmLevels[0] };
  // Accept old links for compatibility, but never take the control mode from the URL.
  const match = /^\/farm\/(?:(?:manual|auto)\/)?(strawberry-\d+|collect|place)\/?$/.exec(path);
  const id = match?.[1] === 'collect' ? 'strawberry-1' : match?.[1] === 'place' ? 'strawberry-2' : match?.[1];
  const level = farmLevels.find(item => item.demo_id === id);
  return level ? { isTask: true, level } : { level: farmLevels[0], invalid: true };
}
