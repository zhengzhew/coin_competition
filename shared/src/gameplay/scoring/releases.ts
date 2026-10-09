import { calculateScoreV1, FUTURE_SCORE_POLICY, type ScoreEvidence, type ScorePolicy } from './v1/policy.js';
export type { ScoreEvidence, ScorePolicy } from './v1/policy.js';
export { FUTURE_SCORE_POLICY } from './v1/policy.js';

export const FUTURE_SCORING_BINDING = Object.freeze({ component: 'completion-efficiency', version: '1.0.0', configuration: 'future-60-20-20' });
const releases = Object.freeze({ '1.0.0': calculateScoreV1 });
export function resolveScoreRelease(version: string) {
  if (!Object.hasOwn(releases, version)) throw new Error(`计分组件版本不可用：${version}`);
  return releases[version as keyof typeof releases];
}
export function scoreWithRelease(version: string, evidence: ScoreEvidence, policy?: Readonly<ScorePolicy>) {
  return resolveScoreRelease(version)(evidence, policy);
}
