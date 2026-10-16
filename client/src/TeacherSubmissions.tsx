import { useEffect, useState } from 'react';

interface SubmissionStats {
  students: number; submissions: number; average_steps: number | null; average_code_lines: number | null;
  average_seconds: number | null; average_score: number | null;
}
interface SubmissionLevel extends SubmissionStats {
  competition: string; level_id: string; title: string; mode: string; content_version: string;
}
interface SubmissionRow {
  submission_id: string; participant_id: string; player_uuid: string; display_name: string;
  competition: string; level_id: string; title: string; mode: string; content_version: string;
  steps: number; code_lines: number; seconds: number; score: number | null; submitted_at: string;
}
export interface SubmissionData { overview: SubmissionStats; levels: SubmissionLevel[]; rows: SubmissionRow[] }
export interface TeacherCompetition {
  id: string; title: string; source: string; levels: { id: string; title: string; modes: string[] }[];
}
export const teacherModeName = (mode: string) => ({ keyboard: '键盘操控', python_blank: '代码操控', manual: '手动驾驶', auto: '编程控制' }[mode] ?? mode);
const value = (n: number | null) => n === null ? '—' : n;

export default function TeacherSubmissions({ data, catalog, tab, query, scoreVisible }: {
  data: SubmissionData; catalog: TeacherCompetition[]; tab: string; query: string; scoreVisible: boolean;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query]);
  if (tab === 'quality') return null;
  const name = (id: string) => catalog.find(event => event.id === id)?.title ?? id;
  const score = (n: number | null) => scoreVisible ? value(n) : '？？';
  const pages = Math.max(1, Math.ceil(data.rows.length / 20)), current = Math.min(page, pages - 1);
  const stats = data.overview;
  return <section aria-label="农场、贝壳与 DEMO 完成记录">
    <div className="analysis-note">农场、贝壳与 DEMO 当前只上传成功完成的记录。这里展示完成提交，不计算首轮成功率、失败次数或重试提升。学生按赛事内随机 ID 区分，保留每次提交和关卡版本。</div>
    <section className="metric-grid">
      {[
        ['完成提交学生', stats.students, '按赛事内学生 ID 去重，跨赛事不合并'],
        ['完成提交记录', stats.submissions, '保留全部成功提交，不限前三次'],
        ['平均步数', value(stats.average_steps), '按当前筛选内每次完成提交计算'],
        ['平均代码行数', value(stats.average_code_lines), '手动驾驶记 0 行'],
        ['平均执行秒数', value(stats.average_seconds), '提交记录中的实际运行时长'],
      ].map(([label, result, note]) => <article className="metric forest" key={label}><span>{label}</span><b>{result}</b><small>{note}</small></article>)}
    </section>
    {tab === 'design' ? <article className="dash-card level-card"><div className="card-title"><span>按赛事、关卡、模式及内容版本汇总</span><h2>完成提交概览</h2></div><div className="table-scroll"><table>
      <thead><tr>{['赛事 / 关卡', '模式 / 版本', '学生数', '完成提交数', '平均步数', '平均代码行数', '平均执行秒数', '平均分'].map(title => <th key={title}>{title}</th>)}</tr></thead>
      <tbody>{data.levels.map(row => <tr key={`${row.competition}:${row.level_id}:${row.mode}:${row.content_version}`}>
        <td><b>{name(row.competition)} · {row.title}</b><small>{row.level_id}</small></td><td>{teacherModeName(row.mode)}<small>{row.content_version}</small></td>
        <td>{row.students}</td><td>{row.submissions}</td><td>{value(row.average_steps)}</td><td>{value(row.average_code_lines)}</td><td>{value(row.average_seconds)}</td><td>{score(row.average_score)}</td>
      </tr>)}</tbody>
    </table></div>{!data.levels.length && <div className="empty">当前范围暂无完成提交记录</div>}</article>
      : <article className="dash-card level-card"><div className="card-title"><span>使用学生在赛事中填写的姓名，按提交时间倒序</span><h2>学生完成提交记录</h2></div><div className="table-scroll"><table>
        <thead><tr>{['学生 / 随机 ID', '赛事 / 关卡', '模式 / 版本', '步数', '代码行数', '执行秒数', '总分', '提交时间'].map(title => <th key={title}>{title}</th>)}</tr></thead>
        <tbody>{data.rows.slice(current * 20, current * 20 + 20).map(row => <tr key={row.submission_id}>
          <td><b>{row.display_name}</b><small>{row.participant_id}</small></td><td>{name(row.competition)} · {row.title}<small>{row.level_id}</small></td><td>{teacherModeName(row.mode)}<small>{row.content_version}</small></td>
          <td>{row.steps}</td><td>{row.code_lines}</td><td>{row.seconds}</td><td>{score(row.score)}</td><td>{new Date(row.submitted_at).toLocaleString('zh-CN')}</td>
        </tr>)}</tbody>
      </table></div>{!data.rows.length && <div className="empty">当前范围暂无完成提交记录</div>}
        <div className="analysis-pagination"><button disabled={!current} onClick={() => setPage(current - 1)}>上一页</button><span>{current + 1} / {pages} 页 · {data.rows.length} 条</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</button></div>
      </article>}
  </section>;
}
