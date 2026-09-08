import { createUuid, validateCount, type Direction, type PythonConfig, type TemplateRow } from '@coin-path/shared';
import './PythonEditor.css';

interface Props {
  config: PythonConfig;
  rows: TemplateRow[];
  onChange: (rows: TemplateRow[]) => void;
  onRun: () => void;
  isRunning: boolean;
  error: string | null;
}

const COMMANDS: Array<{ direction: Direction; label: string; arrow: string }> = [
  { direction: 'up', label: 'move_up()', arrow: '↑' },
  { direction: 'down', label: 'move_down()', arrow: '↓' },
  { direction: 'left', label: 'move_left()', arrow: '←' },
  { direction: 'right', label: 'move_right()', arrow: '→' },
];

const DIRECTION_NAMES: Record<Direction, string> = {
  up: '向上',
  down: '向下',
  left: '向左',
  right: '向右',
};

export default function PythonEditor({ config, rows, onChange, onRun, isRunning, error }: Props) {
  const updateCount = (index: number, count: string) => {
    const next = [...rows];
    next[index] = { ...next[index], count };
    onChange(next);
  };

  const addCommand = (direction: Direction) => {
    if (rows.length >= config.max_rows) return;
    const rowId = createUuid();
    onChange([...rows, { row_id: rowId, direction, count: '' }]);
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`[data-row-id="${rowId}"] input`)?.focus();
    });
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="python-editor" aria-label="代码操控编辑器">
      <div className="editor-header">
        <div><span className="editor-kicker">代码操控</span><h3>编辑指令</h3></div>
        <span className="editor-hint">括号内填写步数</span>
      </div>

      <div className="command-palette" aria-label="可用指令">
        <strong>点击加入指令</strong>
        {COMMANDS.map((command) => (
          <button
            key={command.direction}
            type="button"
            onClick={() => addCommand(command.direction)}
            disabled={isRunning || rows.length >= config.max_rows}
            aria-label={`加入${DIRECTION_NAMES[command.direction]}指令`}
            data-track-id={`python.command.add.${command.direction}`}
          >
            <span>{command.arrow}</span><code>{command.label}</code>
          </button>
        ))}
      </div>

      <div className={`editor-rows ${rows.length ? '' : 'empty'}`} data-track-id="python.editor.rows">
        {!rows.length && <div className="editor-empty">点击上方指令，把代码加入这里</div>}
        {rows.map((row, index) => {
          const direction = row.direction as Direction;
          const countValid = row.count === '' || row.count === null || validateCount(row.count).valid;
          return (
            <div key={row.row_id} className="editor-row" data-row-id={row.row_id}>
              <span className="row-number">{index + 1}</span>
              <span className="code-fixed command-name">move_{direction}(</span>
              <input
                className={`code-input count-input ${countValid ? '' : 'invalid'}`}
                value={row.count ?? ''}
                onChange={(event) => updateCount(index, event.target.value)}
                disabled={isRunning}
                placeholder="步数"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                autoComplete="off"
                aria-label={`第 ${index + 1} 行${DIRECTION_NAMES[direction]}移动步数`}
                data-track-id={`python.row.${row.row_id}.count`}
              />
              <span className="code-fixed">)</span>
              <button
                className="row-btn remove"
                type="button"
                onClick={() => removeRow(index)}
                disabled={isRunning}
                aria-label={`删除第 ${index + 1} 行`}
                data-track-id={`python.row.${row.row_id}.remove`}
              >−</button>
            </div>
          );
        })}
      </div>

      {rows.length >= config.max_rows && <p className="row-limit">本关最多添加 {config.max_rows} 行指令</p>}
      {error && <p className="editor-error" role="alert">{error}</p>}
      <button className="run-btn" onClick={onRun} disabled={isRunning} data-track-id="python.run">
        {isRunning ? '正在运行…' : '▶ 运行程序'}
      </button>
    </section>
  );
}
