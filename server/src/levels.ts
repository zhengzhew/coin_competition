import { type LevelDef } from '@coin-path/shared';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
let cachedLevels: LevelDef[] | null = null;

function findLevelsFile(): string {
  const candidates = [
    process.env.COIN_LEVELS_PATH,
    resolve(process.cwd(), 'levels.teacher.json'),
    resolve(moduleDir, '../../levels.teacher.json'),
    resolve(moduleDir, '../../../levels.teacher.json'),
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`levels.teacher.json not found. Checked: ${candidates.join(', ')}`);
  return found;
}

export function loadLevels(): LevelDef[] {
  if (cachedLevels) return cachedLevels;
  const parsed = JSON.parse(readFileSync(findLevelsFile(), 'utf8')) as { levels: LevelDef[] };
  if (!Array.isArray(parsed.levels) || parsed.levels.length !== 20) {
    throw new Error('The content pack must contain exactly 20 levels.');
  }
  cachedLevels = parsed.levels;
  return cachedLevels;
}

export function getLevel(levelId: string): LevelDef | undefined {
  return loadLevels().find((level) => level.level_id === levelId);
}

export function getLevelForAssignment(assignmentKey: string): LevelDef | undefined {
  if (!/^[KP](0[1-9]|1\d|20)$/.test(assignmentKey)) return undefined;
  return getLevel(`L${assignmentKey.slice(1)}`);
}
