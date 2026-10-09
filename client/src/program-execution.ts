import type { TemplateRow } from '@coin-path/shared';

/** Source-row mapping for an already validated program, including repeated loop bodies. */
export function executionRows(rows: TemplateRow[], robot: boolean): string[] {
  return rows.flatMap(row => {
    if (row.direction === 'repeat') {
      const body = executionRows(row.children ?? [], robot);
      return Array.from({ length: Number(row.count) }, () => body).flat();
    }
    const count = !robot || ['forward', 'backward', 'wait'].includes(row.direction) ? Number(row.count) : 1;
    return Array.from({ length: count }, () => row.row_id);
  });
}
export function programLineNumbers(rows: TemplateRow[]): Map<string, number> {
  const lines = new Map<string, number>();
  const visit = (items: TemplateRow[]) => items.forEach(row => { lines.set(row.row_id, lines.size + 1); if (row.children) visit(row.children); });
  visit(rows); return lines;
}
