import { useEffect, useRef } from 'react';
import { BEACH_PROGRAM_COMMANDS } from '@coin-path/shared';
import { CompetitionActions } from '../components/CompetitionTemplate';
import { useCodeInsertion } from '../components/useCodeInsertion';
import FarmCodeEditor from '../farm/FarmCodeEditor';

export default function BeachProgramEditor({ source, running, ready, activeLine, error, notice, onChange, onRun, onStop, onReset, paused, onPause }: {
  paused: boolean; onPause: () => void;
  source: string; running: boolean; ready: boolean; activeLine: number | null; error: string; notice: string;
  onChange: (value: string) => void; onRun: () => void; onStop: () => void; onReset: () => void;
}) {
  const { field, insert } = useCodeInsertion(source, onChange);
  const fields = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((running || error) && fields.current) fields.current.scrollTop = fields.current.scrollHeight;
  }, [running, error]);
  return <section className="beach-control-card beach-program-editor" aria-label="代码操控">
    <div className="beach-card-heading"><h2>指令程序</h2><span>{running && activeLine ? `正在执行第 ${activeLine} 行` : '按顺序执行'}</span></div>
    <div className="beach-program-fields" ref={fields}>
    <div className="beach-command-palette" aria-label="可用指令">{BEACH_PROGRAM_COMMANDS.map(command => <button key={command.action} disabled={running} title={`插入 ${command.template}`} onClick={() => insert(command.template)}><b>{command.label}</b><code>{command.hint}</code></button>)}</div>
    <p className="beach-code-hint">距离：厘米 · 角度：度<br />移动到点以车体中心为准；0° 向上，90° 向右。</p>
    <FarmCodeEditor inputRef={field} source={source} onChange={onChange} running={running} activeLine={running ? activeLine : null} />
    <details className="beach-code-guide"><summary>指令参数说明</summary><p>前进／后退填写大于 0、最多 120 cm 的距离；左转／右转填写大于 0、最多 360° 的角度。</p><p>移动到点：X、Y 为 0–120 的整数厘米坐标，左下角 (0,0)；转到角度：0–360° 的绝对角度。精准定位速度为普通移动／转向的 50%。</p><p>合拢与张开不填参数。每行一条指令，可以用 # 写注释；停稳到位即可自动交付。</p></details>
    {error && <p className="beach-code-error" role="alert">{error}</p>}{notice && <small role="status">{notice}</small>}
    </div>
    <div className="beach-program-actions">
    <CompetitionActions running={running} paused={paused} onPause={onPause} busy={!ready} canReset={!running} onRun={onRun} onStop={onStop} onReset={onReset} testId="beach-start" />
    </div>
  </section>;
}
