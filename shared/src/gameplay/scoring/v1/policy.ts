/** Published implementation: add a new version instead of changing this file. */
export interface ScorePolicy {
  completion: number;
  efficiency: number;
  programming: number;
}
export interface ScoreEvidence {
  complete: boolean;
  actionCount: number;
  actionTarget?: number;
  programMode: boolean;
  verifiedCodeLines?: number;
  codeTarget?: number;
}
export const FUTURE_SCORE_POLICY: Readonly<ScorePolicy> = Object.freeze({ completion: 60, efficiency: 20, programming: 20 });

export function calculateScoreV1(evidence: ScoreEvidence, policy: Readonly<ScorePolicy> = FUTURE_SCORE_POLICY) {
  for (const value of [policy.completion, policy.efficiency, policy.programming]) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 10000) throw new Error('分值必须是 0–10000 的整数');
  }
  const validCount = (value: number | undefined): value is number => value !== undefined && Number.isInteger(value) && value >= 0;
  const efficient = evidence.complete && validCount(evidence.actionCount) && validCount(evidence.actionTarget) && evidence.actionCount <= evidence.actionTarget;
  const verified = evidence.programMode && validCount(evidence.verifiedCodeLines);
  const concise = efficient && verified && validCount(evidence.codeTarget) && evidence.verifiedCodeLines! <= evidence.codeTarget;
  const completion = evidence.complete ? policy.completion : 0;
  const efficiency = efficient ? policy.efficiency : 0;
  const programming = concise ? policy.programming : 0;
  return { completion, efficiency, programming, total: completion + efficiency + programming,
    maximum: policy.completion + policy.efficiency + (evidence.programMode ? policy.programming : 0),
    verified, reasons: [evidence.complete ? '任务已完成' : '任务未完成，不计得分',
      efficient ? '行动数达标' : '行动数未达标或任务未完成',
      !evidence.programMode ? '手动模式不含代码分' : !verified ? '代码未经核验，不计代码分' : concise ? '代码行数达标' : '代码行数或行动数未达标'] };
}
