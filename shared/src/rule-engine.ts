import {
  type Direction,
  type GameState,
  type GameStatus,
  type Command,
  type StepResult,
  type DomainEvent,
  type LevelDef,
  type ScoreResult,
  DIRECTIONS,
} from './types.js';

// ===== Initialization =====

export function createGameState(level: LevelDef): GameState {
  const walls = new Set<string>();
  for (const [wx, wy] of level.walls) {
    walls.add(`${wx},${wy}`);
  }

  const coins = new Map<string, string>();
  for (const coin of level.coins) {
    coins.set(`${coin.position[0]},${coin.position[1]}`, coin.id);
  }

  return {
    x: level.start[0],
    y: level.start[1],
    width: level.width,
    height: level.height,
    walls,
    coins,
    collected: [],
    collected_mask: 0,
    steps: 0,
    collisions: 0,
    consumed_commands: 0,
    status: 'running',
    trace: [[level.start[0], level.start[1]]],
  };
}

// ===== Core Step Function (Pure) =====

export function step(
  state: GameState,
  command: Command,
  requiredOrder: string[] | null,
  totalCoins: number,
  maxCommands = 256,
  stepLimit?: number | null,
): StepResult {
  if (state.status !== 'running') {
    return {
      state,
      event: {
        type: 'move_success',
        command_index: command.command_index,
        position: [state.x, state.y],
        direction: command.direction,
      },
    };
  }

  const [dx, dy] = DIRECTIONS[command.direction];
  const nx = state.x + dx;
  const ny = state.y + dy;
  const posKey = `${nx},${ny}`;

  // Boundary check
  const outOfBounds = nx < 0 || nx >= state.width || ny < 0 || ny >= state.height;
  // Wall check
  const hitWall = state.walls.has(posKey);

  if (outOfBounds || hitWall) {
    const newCollisions = state.collisions + 1;
    const newConsumed = state.consumed_commands + 1;
    let newStatus: GameStatus = 'running';
    if (newConsumed >= maxCommands) {
      newStatus = 'command_limit';
    }

    const nextState: GameState = {
      ...state,
      collisions: newCollisions,
      consumed_commands: newConsumed,
      status: newStatus,
    };

    return {
      state: nextState,
      event: {
        type: 'collision',
        command_index: command.command_index,
        position: [state.x, state.y],
        direction: command.direction,
      },
    };
  }

  // Successful move
  const newSteps = state.steps + 1;
  const newConsumed = state.consumed_commands + 1;
  const newTrace: [number, number][] = [...state.trace, [nx, ny]];

  // Check coin pickup
  let newCollected = [...state.collected];
  let newMask = state.collected_mask;
  let coinId: string | undefined;
  let collected = false;

  if (state.coins.has(posKey) && !newCollected.includes(state.coins.get(posKey)!)) {
    coinId = state.coins.get(posKey)!;
    if (requiredOrder && requiredOrder[newCollected.length] !== coinId) {
      return {
        state: {
          ...state,
          x: nx,
          y: ny,
          steps: newSteps,
          consumed_commands: newConsumed,
          trace: newTrace,
        },
        event: {
          type: 'order_violation',
          command_index: command.command_index,
          position: [nx, ny],
          direction: command.direction,
          coin_id: coinId,
          collected_order: newCollected,
        },
      };
    }
    const coinIndex = [...state.coins.values()].indexOf(coinId);
    newCollected.push(coinId);
    newMask |= 1 << coinIndex;
    collected = true;
  }

  // Check all collected
  if (newCollected.length === totalCoins) {
    return {
      state: {
        ...state,
        x: nx,
        y: ny,
        steps: newSteps,
        consumed_commands: newConsumed,
        collected: newCollected,
        collected_mask: newMask,
        status: 'success',
        trace: newTrace,
      },
      event: {
        type: 'all_collected',
        command_index: command.command_index,
        position: [nx, ny],
        direction: command.direction,
        coin_id: coinId,
        collected_order: newCollected,
        steps: newSteps,
      },
    };
  }

  // Budget levels settle openly when the successful-move allowance is used.
  if (stepLimit && newSteps >= stepLimit) {
    return {
      state: {
        ...state,
        x: nx,
        y: ny,
        steps: newSteps,
        consumed_commands: newConsumed,
        collected: newCollected,
        collected_mask: newMask,
        status: 'success',
        trace: newTrace,
      },
      event: {
        type: 'budget_exhausted',
        command_index: command.command_index,
        position: [nx, ny],
        direction: command.direction,
        coin_id: coinId,
        collected_order: newCollected,
        steps: newSteps,
      },
    };
  }

  // Check command limit
  if (newConsumed >= maxCommands) {
    return {
      state: {
        ...state,
        x: nx,
        y: ny,
        steps: newSteps,
        consumed_commands: newConsumed,
        collected: newCollected,
        collected_mask: newMask,
        status: 'command_limit',
        trace: newTrace,
      },
      event: {
        type: 'command_limit',
        command_index: command.command_index,
        position: [nx, ny],
        direction: command.direction,
        coin_id: coinId,
      },
    };
  }

  // Normal move (with or without coin)
  const nextState: GameState = {
    ...state,
    x: nx,
    y: ny,
    steps: newSteps,
    consumed_commands: newConsumed,
    collected: newCollected,
    collected_mask: newMask,
    trace: newTrace,
  };

  const event: DomainEvent = collected
    ? {
        type: 'coin_collected',
        command_index: command.command_index,
        position: [nx, ny],
        direction: command.direction,
        coin_id: coinId,
        collected_order: newCollected,
      }
    : {
        type: 'move_success',
        command_index: command.command_index,
        position: [nx, ny],
        direction: command.direction,
      };

  return { state: nextState, event };
}

// ===== Scoring =====

export function calculateScore(
  state: GameState,
  totalCoins: number,
  optimalSteps?: number,
  coinValues?: Record<string, number>,
  optimalValue?: number | null,
): ScoreResult {
  const values = coinValues ?? {};
  const collectedValue = state.collected.reduce((sum, id) => sum + (values[id] ?? 1), 0);
  const totalValue = Object.keys(values).length
    ? Object.values(values).reduce((sum, value) => sum + value, 0)
    : totalCoins;

  if (optimalValue) {
    const ratio = Math.min(1, collectedValue / optimalValue);
    return {
      collection_score: Math.round(60 * ratio * 10) / 10,
      route_score: Math.round(40 * ratio * 10) / 10,
      total_score: Math.round(100 * ratio * 10) / 10,
      collected_count: state.collected.length,
      total_coins: totalCoins,
      steps: state.steps,
      collected_value: collectedValue,
      total_value: totalValue,
      optimal_value: optimalValue,
    };
  }

  const collectionScore = totalCoins > 0
    ? (60 * state.collected.length) / totalCoins
    : 0;

  const routeScore = state.status === 'success' && state.steps > 0 && optimalSteps
    ? Math.min(40, (40 * optimalSteps) / state.steps)
    : 0;

  return {
    collection_score: Math.round(collectionScore * 10) / 10,
    route_score: Math.round(routeScore * 10) / 10,
    total_score: Math.round((collectionScore + routeScore) * 10) / 10,
    collected_count: state.collected.length,
    total_coins: totalCoins,
    steps: state.steps,
    optimal_steps: optimalSteps,
    collected_value: collectedValue,
    total_value: totalValue,
  };
}
