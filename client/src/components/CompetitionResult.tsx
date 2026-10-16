import type { ReactNode } from 'react';
import './CompetitionResult.css';

export const scoringRuleHint = '总分按教师规则计算；未设置时显示“？？”。仅成功完成任务后提交排行榜。';

export function RunSummary({ children }: { children: ReactNode }) {
  return <div className="competition-run-summary" aria-label="本轮进度">{children}</div>;
}

export function CompetitionResult({ score, completed = true, failed = false, onReset, onNext, scoreTestId }: {
  score: number | null | undefined; completed?: boolean; failed?: boolean;
  onReset: () => void; onNext?: () => void; scoreTestId?: string;
}) {
  return <section className="competition-result score-panel" role="status" aria-label="本轮成绩">
    <div className="score-total"><span>{completed ? '任务完成' : '本轮未完成'}</span><b data-testid={scoreTestId}>{!completed || score === undefined ? '—' : score ?? '？？'}</b>{completed && typeof score === 'number' && <em>分</em>}</div>
    <p>{!completed ? '本轮不计分，也不会进入排行榜。' : failed ? '成绩提交失败，请在下方重试。' : score === undefined ? '正在提交成绩…' : score === null ? '教师设置计分规则后显示总分。' : '总分按教师规则计算。'}</p>
    <div className="competition-result-actions"><button onClick={onReset} data-track-id="attempt.reset_after_score">再挑战一次</button>{completed && onNext && <button onClick={onNext} data-track-id="attempt.next_level">下一关 →</button>}</div>
  </section>;
}
