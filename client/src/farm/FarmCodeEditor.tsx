import { useEffect, useRef, useState, type RefObject } from 'react';

export default function FarmCodeEditor({ source, onChange, running, activeLine, inputRef }: {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  source: string; onChange: (value: string) => void; running: boolean; activeLine: number | null;
}) {
  const fallback = useRef<HTMLTextAreaElement>(null);
  const field = inputRef ?? fallback;
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
    <div className="farm-code-overlay" aria-hidden="true"><pre style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>{source.split('\n').map((line, index) => {
      const comment = line.indexOf('#');
      return <span key={index} className={`farm-code-line${activeLine === index + 1 ? ' active' : ''}`} data-line={index + 1} data-testid={activeLine === index + 1 ? 'running-code-line' : undefined}><i>{index + 1}</i>{comment < 0 ? line || '\u200b' : <>{line.slice(0, comment)}<span className="farm-code-comment">{line.slice(comment)}</span></>}</span>;
    })}</pre></div>
    <textarea ref={field} className="third-program-source" aria-label="指令程序" value={source} disabled={running} wrap="off" spellCheck={false} autoComplete="off" maxLength={8000}
      onScroll={event => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}
      onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); const el = event.currentTarget, start = el.selectionStart; onChange(source.slice(0, start) + '    ' + source.slice(el.selectionEnd)); requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4)); } }}
      onChange={event => onChange(event.target.value)} />
  </div>;
}
