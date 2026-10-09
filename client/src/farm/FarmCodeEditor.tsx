import { useEffect, useRef, useState } from 'react';

export default function FarmCodeEditor({ source, onChange, running, activeLine }: {
  source: string; onChange: (value: string) => void; running: boolean; activeLine: number | null;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!activeLine || !field.current) return;
    const editor = field.current, style = getComputedStyle(editor);
    const lineHeight = parseFloat(style.lineHeight), padding = parseFloat(style.paddingTop);
    const top = padding + (activeLine - 1) * lineHeight, bottom = top + lineHeight;
    if (top < editor.scrollTop + padding) editor.scrollTop = top - padding;
    else if (bottom > editor.scrollTop + editor.clientHeight - padding) editor.scrollTop = bottom - editor.clientHeight + padding;
    setScroll({ top: editor.scrollTop, left: editor.scrollLeft });
  }, [activeLine]);
  return <div className="farm-code-editor">
    <div className="farm-code-overlay" aria-hidden="true"><pre style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{source.split('\n').map((line, index) =>
      <span key={index} className={`farm-code-line${activeLine === index + 1 ? ' active' : ''}`} data-line={index + 1} data-testid={activeLine === index + 1 ? 'running-code-line' : undefined}><i>{index + 1}</i>{line || '\u200b'}</span>
    )}</pre></div>
    <textarea ref={field} className="third-program-source" aria-label="指令程序" value={source} disabled={running} wrap="off" spellCheck={false} autoComplete="off" maxLength={8000}
      onScroll={event => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}
      onChange={event => onChange(event.target.value)} />
  </div>;
}
