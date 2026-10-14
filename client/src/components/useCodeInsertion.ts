import { useLayoutEffect, useRef } from 'react';

/** Preserve the editor caret when a palette button takes focus. */
export function useCodeInsertion(source: string, onChange: (value: string) => void) {
  const field = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    field.current?.focus(); field.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [source]);
  const insert = (command: string) => {
    const editor = field.current;
    if (editor?.disabled) return;
    const start = editor?.selectionStart ?? source.length;
    const end = editor?.selectionEnd ?? start;
    const before = source.slice(0, start), after = source.slice(end);
    const indent = /^\s*/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[0] ?? '';
    const prefix = before && !before.endsWith('\n') && before.trimEnd().length === before.length ? '\n' + indent : '';
    const text = prefix + command.replace(/\n/g, '\n' + indent) + (after && !after.startsWith('\n') ? '\n' : '');
    pendingCaret.current = start + text.length;
    onChange(before + text + after);
  };
  return { field, insert };
}
