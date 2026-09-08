// ===== Core Game Types =====

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: Record<Direction, [number, number]> = {
  right: [1, 0],
  up: [0, 1],
  left: [-1, 0],
  down: [0, -1],
};

export interface Position {
  x: number;
  y: number;
}

export interface CoinDef {
  id: string;          // e.g. "A", "B", "C"
  position: [number, number]; // [x, y]
}

export interface LevelDef {
  level_id: string;        // "L01".."L20"
  keyboard_id: string;     // "K01".."K20"
  python_id: string;       // "P01".."P20"
  title: string;
  stage: 'explore' | 'guided' | 'challenge';
  width: number;
  height: number;
  start: [number, number]; // [x, y]
  coins: CoinDef[];
  walls: [number, number][];
  required_order: string[] | null;  // null = free order
  max_commands: number;             // 256
  max_attempts?: number | null;
  expected_optimal_steps?: number;
  python: PythonConfig;
  knowledge: string;
  objective: string;
}

export interface PythonConfig {
  template_id: 'call_slots_v2' | 'repeat_slots_v2';
  initial_rows: number;
  min_rows: number;
  max_rows: number;
  can_add_delete_rows: boolean;
  count_range: [number, number] | null; // [0, 20] for repeat_slots
  allowed_functions: string[];
}

// ===== Game State =====

export interface GameState {
  x: number;
  y: number;
  width: number;
  height: number;
  walls: Set<string>;       // "x,y"
  coins: Map<string, string>; // "x,y" -> coin_id
  collected: string[];      // coin_ids in pickup order
  collected_mask: number;   // bitmask
  steps: number;            // successful moves (not collisions)
  collisions: number;
  consumed_commands: number;
  status: GameStatus;
  trace: [number, number][]; // positions including start
}

export type GameStatus =
  | 'draft'
  | 'running'
  | 'success'
  | 'order_violation'
  | 'command_limit'
  | 'incomplete'
  | 'stopped'
  | 'abandoned'
  | 'expired';

export interface Command {
  direction: Direction;
  command_index: number;
  command_id: string;
  source: 'keyboard' | 'python_blank';
}

export interface StepResult {
  state: GameState;
  event: DomainEvent;
}

export interface DomainEvent {
  type: 'move_success' | 'collision' | 'coin_collected' | 'order_violation' | 'all_collected' | 'command_limit';
  command_index: number;
  position: [number, number];
  direction: Direction;
  coin_id?: string;
  collected_order?: string[];
  steps?: number;
}

// ===== Assignment / Attempt =====

export type Mode = 'keyboard' | 'python_blank';

export interface Assignment {
  assignment_key: string;  // "K01", "P01", etc.
  level_id: string;
  mode: Mode;
  max_attempts: number | null;  // null for explore/teach stages
  player_uuid: string;
}

export interface Attempt {
  attempt_id: string;
  assignment_key: string;
  player_uuid: string;
  mode: Mode;
  trial_index: number;
  status: GameStatus;
  steps: number;
  collisions: number;
  collected_count: number;
  collected_order: string[];
  score: number | null;
  commands: Direction[];
  program_snapshot?: string;
  started_at: string;
  finalized_at: string | null;
}

// ===== Scoring =====

export interface ScoreResult {
  collection_score: number;   // 0-60
  route_score: number;        // 0-40
  total_score: number;        // 0-100
  collected_count: number;
  total_coins: number;
  steps: number;
  optimal_steps?: number;
}

// ===== Player =====

export interface Player {
  player_uuid: string;
  display_name: string;
  language_experience?: 'python' | 'cpp' | 'both' | 'none';
  created_at: string;
}

// ===== Session =====

export interface Session {
  session_id: string;
  teacher_id: string;
  mode_config: 'full40' | 'sample14' | string[];
  status: 'created' | 'active' | 'closed';
  created_at: string;
}

// ===== Telemetry Envelope =====

export interface TelemetryEvent {
  schema_version: '2.0.0';
  event_id: string;
  player_uuid: string | null;
  session_id: string | null;
  assignment_key: string | null;
  level_id: string | null;
  mode: Mode | null;
  attempt_id: string | null;
  stream_id: string;
  seq: number;
  event_type: string;
  element_id: string | null;
  interaction_id: string | null;
  client_time: string;
  page_instance_id: string;
  mono_ms: number;
  elapsed_ms: number;
  payload: Record<string, unknown>;
}
