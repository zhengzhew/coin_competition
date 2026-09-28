export type ThirdCategory = 'collect' | 'place';
export type ThirdMode = 'auto' | 'manual';
export type ThirdSimulation = 'grid' | 'simulation3d';
export type ThirdAction = 'forward' | 'backward' | 'turn_left' | 'turn_right' | 'grab' | 'release' | 'wait';
export interface ThirdObject { id: string; x: number; z: number; heading?: number; goal?: { x: number; z: number }; }
interface SceneBase {
  width: number; depth: number;
  start: { x: number; z: number; heading: number };
  objects: ThirdObject[];
  walls: { x: number; z: number; width?: number; depth?: number }[];
}
export type ThirdSceneConfig = (SceneBase & { kind: 'grid' }) | (SceneBase & {
  kind: 'simulation3d'; speed: number; turnSpeed: number;
});
export interface ThirdDemo {
  competition_id: 'third'; demo_id: string; content_version: string;
  category: ThirdCategory; simulation: ThirdSimulation;
  supported_modes: ThirdMode[]; title: string; objective: string; description: string;
  status: 'planned' | 'sample' | 'ready'; scene_config: ThirdSceneConfig;
  starter: string;
}
export interface ThirdSnapshot {
  x: number; z: number; heading: number;
  objects: ThirdObject[]; holding: string | null; collected: string[];
  completed: boolean; blocked: boolean; message: string; actions: number;
  gripper?: ThirdGripper;
}
export interface ThirdGripper {
  target: 'open' | 'closed'; phase: 'open' | 'opening' | 'closing' | 'closed' | 'holding' | 'blocked';
  gap: number; fingers: [number, number];
}
export interface ThirdInstruction { action: ThirdAction; value: number; line: number; }
export const THIRD_FIXED_STEP = 1 / 60;
export const THIRD_MAX_SECONDS = 120;
