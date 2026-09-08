import type { PythonConfig, TemplateRow } from '@coin-path/shared';
import { validateCount, validateDirection } from '@coin-path/shared';
import './PythonEditor.css';

interface Props {
  config: PythonConfig;
  rows: TemplateRow[];
  onChange: (rows: TemplateRow[]) => void;
  onRun: () => void;
  isRunning: boolean;
  error: string | null;
}

export default function PythonEditor({ config, rows, onChange, onRun, isRunning, error }: Props) {
  const isRepeat = config.template_id === 'repeat_slots_v2';
  const update = (index: number, values: Partial<TemplateRow>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...values };
    onChange(next);
  };
  const addRow = () => {
    if (rows.length >= config.max_rows) return;
    onChange([...rows, { row_id: crypto.randomUUID(), direction: '', count: isRepeat ? '' : null }]);
  };
  const removeRow = (index: number) => {
    if (rows.length <= config.min_rows) return;
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="python-editor" aria-label="Python 填空编辑器">
      <div className="editor-header">
        <div><span className="editor-kicker">受限代码区</span><h3>填写程序</h3></div>
        <span className="editor-hint">{isRepeat ? '填写次数与方向' : '只填写方向'}</span>
      </div>
      <div className="allowed-code" data-track-id="python.allowed_code">
        <strong>可用：</strong>
        <code>up</code><code>down</code><code>left</code><code>right</code>
        {isRepeat && <code>range(0-20)</code>}
      </div>
      <div className="editor-rows">
        {rows.map((row, index) => {
          const directionValid = !row.direction || validateDirection(row.direction).valid;
          const countValid = !isRepeat || row.count === '' || row.count === null || validateCount(row.count).valid;
          return (
            <div key={row.row_id} className="editor-row">
              <span className="row-number">{index + 1}</span>
              {isRepeat ? <>
                <span className="code-fixed">for _ in range(</span>
                <input className={`code-input count-input ${countValid ? '' : 'invalid'}`}
                  value={row.count ?? ''} onChange={(event) => update(index, { count: event.target.value })}
                  disabled={isRunning} placeholder="?" inputMode="numeric"
                  aria-label={`第 ${index + 1} 段重复次数`}
                  data-track-id={`python.row.${row.row_id}.count`} />
                <span className="code-fixed">):</span>
                <span className="code-fixed indent">move_</span>
              </> : <span className="code-fixed">move_</span>}
              <input className={`code-input dir-input ${directionValid ? '' : 'invalid'}`}
                value={row.direction} onChange={(event) => update(index, { direction: event.target.value })}
                disabled={isRunning} placeholder="?" spellCheck={false}
                aria-label={`第 ${index + 1} 段移动方向`}
                data-track-id={`python.row.${row.row_id}.direction`} />
              <span className="code-fixed">()</span>
              {config.can_add_delete_rows && <button className="row-btn remove" onClick={() => removeRow(index)}
                disabled={isRunning || rows.length <= config.min_rows} aria-label={`删除第 ${index + 1} 行`}
                data-track-id={`python.row.${row.row_id}.remove`}>−</button>}
            </div>
          );
        })}
      </div>
      {config.can_add_delete_rows && rows.length < config.max_rows &&
        <button className="add-row-btn" onClick={addRow} disabled={isRunning} data-track-id="python.row.add">＋ 添加一段</button>}
      {error && <p className="editor-error" role="alert">{error}</p>}
      <button className="run-btn" onClick={onRun} disabled={isRunning} data-track-id="python.run">
        {isRunning ? '正在运行…' : '▶ 运行程序'}
      </button>
    </section>
  );
}
