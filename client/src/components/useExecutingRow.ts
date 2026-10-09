import { useEffect, useRef } from 'react';

export function useExecutingRow(rowId?: string | null) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = viewport.current;
    if (!container || !rowId) return;
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id]')).find(node => node.dataset.rowId === rowId);
    if (!row) return;
    const box = row.getBoundingClientRect(), bounds = container.getBoundingClientRect();
    if (box.top < bounds.top + 12) container.scrollTop += box.top - bounds.top - 12;
    else if (box.bottom > bounds.bottom - 12) container.scrollTop += box.bottom - bounds.bottom + 12;
  }, [rowId]);
  return viewport;
}
