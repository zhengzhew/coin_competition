import { type Direction, type LevelDef, DIRECTIONS } from './types.js';

// ===== BFS Solver =====

interface BFSState {
  x: number;
  y: number;
  mask: number;
}

/**
 * BFS to find optimal path.
 * @param level - Level definition
 * @param requiredOrder - null for free order, or array of coin ids for fixed order
 * @returns Array of directions (optimal path) or null if unsolvable
 */
export function solve(level: LevelDef, requiredOrder: string[] | null): Direction[] | null {
  const { width, height, start, coins, walls } = level;
  const wallSet = new Set(walls.map(([x, y]) => `${x},${y}`));
  const coinPositions = new Map<string, { index: number; id: string }>();
  coins.forEach((c, i) => {
    coinPositions.set(`${c.position[0]},${c.position[1]}`, { index: i, id: c.id });
  });

  const fullMask = (1 << coins.length) - 1;
  const startState: BFSState = { x: start[0], y: start[1], mask: 0 };

  // BFS queue: [state, path]
  const queue: [BFSState, Direction[]][] = [[startState, []]];
  const visited = new Set<string>();
  visited.add(`${start[0]},${start[1]},0`);

  while (queue.length > 0) {
    const [current, path] = queue.shift()!;

    if (current.mask === fullMask) {
      return path;
    }

    for (const [dir, [dx, dy]] of Object.entries(DIRECTIONS) as [Direction, [number, number]][]) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      // Bounds check
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      // Wall check
      if (wallSet.has(`${nx},${ny}`)) continue;

      let newMask = current.mask;
      const coinKey = `${nx},${ny}`;
      const coinInfo = coinPositions.get(coinKey);

      if (coinInfo && !(current.mask & (1 << coinInfo.index))) {
        // Picking up a new coin
        if (requiredOrder) {
          const collectedCount = countBits(current.mask);
          if (requiredOrder[collectedCount] !== coinInfo.id) {
            continue; // Wrong order, skip
          }
        }
        newMask |= 1 << coinInfo.index;
      }

      const stateKey = `${nx},${ny},${newMask}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      queue.push([{ x: nx, y: ny, mask: newMask }, [...path, dir]]);
    }
  }

  return null; // No solution
}

function countBits(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

// ===== Replay (Server-side verification) =====

export interface ReplayResult {
  status: 'success' | 'order_violation' | 'command_limit' | 'incomplete' | 'stopped';
  steps: number;
  collisions: number;
  consumed_commands: number;
  collected_order: string[];
  end: [number, number];
  trace: [number, number][];
}

export function replay(
  level: LevelDef,
  commands: Direction[],
  requiredOrder: string[] | null,
): ReplayResult {
  const { width, height, start, coins, walls } = level;
  const wallSet = new Set(walls.map(([x, y]) => `${x},${y}`));
  const coinMap = new Map<string, string>();
  for (const c of coins) {
    coinMap.set(`${c.position[0]},${c.position[1]}`, c.id);
  }

  let x = start[0];
  let y = start[1];
  const collected: string[] = [];
  const trace: [number, number][] = [[x, y]];
  let steps = 0;
  let collisions = 0;
  let consumed = 0;
  let status: ReplayResult['status'] = 'incomplete';

  for (const dir of commands) {
    consumed++;
    const [dx, dy] = DIRECTIONS[dir];
    const nx = x + dx;
    const ny = y + dy;

    // Collision
    if (nx < 0 || nx >= width || ny < 0 || ny >= height || wallSet.has(`${nx},${ny}`)) {
      collisions++;
      if (consumed >= level.max_commands) {
        status = 'command_limit';
        break;
      }
      continue;
    }

    x = nx;
    y = ny;
    steps++;
    trace.push([x, y]);

    // Coin pickup
    const coinKey = `${x},${y}`;
    const coinId = coinMap.get(coinKey);
    if (coinId && !collected.includes(coinId)) {
      collected.push(coinId);

      // Order check
      if (requiredOrder) {
        const expectedIndex = collected.length - 1;
        if (requiredOrder[expectedIndex] !== coinId) {
          status = 'order_violation';
          break;
        }
      }

      // All collected
      if (collected.length === coins.length) {
        status = 'success';
        break;
      }
    }

    if (consumed >= level.max_commands) {
      status = 'command_limit';
      break;
    }
  }

  return {
    status,
    steps,
    collisions,
    consumed_commands: consumed,
    collected_order: collected,
    end: [x, y],
    trace,
  };
}

// ===== Program Expansion =====

/**
 * Expand a Python template program into a list of directions.
 * This is the server-side verification of what the student's code produces.
 */
export interface ProgramRow {
  direction: Direction;
  count: number;
}

export function expandProgram(rows: ProgramRow[]): Direction[] {
  const commands: Direction[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      commands.push(row.direction);
    }
  }
  return commands;
}

/**
 * Compact a list of directions into rows (for display).
 */
export function compactCommands(commands: Direction[]): ProgramRow[] {
  const rows: ProgramRow[] = [];
  for (const dir of commands) {
    if (rows.length > 0 && rows[rows.length - 1].direction === dir) {
      rows[rows.length - 1].count++;
    } else {
      rows.push({ direction: dir, count: 1 });
    }
  }
  return rows;
}
