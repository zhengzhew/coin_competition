import { type Direction, type PythonConfig, DIRECTIONS } from './types.js';
import { ROBOT_ACTIONS } from './robot.js';
import {createUuid} from './uuid.js';
import type { Action } from './types.js';

// ===== Python Template Validation =====

const VALID_DIRECTIONS = new Set(Object.keys(DIRECTIONS));

export interface TemplateRow {
  children?: TemplateRow[];
  row_id: string;
  direction: string;
  count: string | null;  // retain the raw input for validation and telemetry
}

/** Written lines: repeat header + body, independent of repetition/step counts. */
export function countCodeLines(rows:TemplateRow[]):number {
  return rows.reduce((sum,row)=>sum+1+(row.direction==='repeat'?countCodeLines(row.children??[]):0),0);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  expanded?: Action[];
}

/**
 * Validate a direction value against the whitelist.
 */
export function validateDirection(value: string): { valid: boolean; error?: string } {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return { valid: false, error: '方向不能为空' };
  if (!VALID_DIRECTIONS.has(trimmed)) return { valid: false, error: `无效方向 "${trimmed}"，只能填 up/down/left/right` };
  if (trimmed.includes('move_')) return { valid: false, error: '只需填方向（如 up），不需要填 move_up()' };
  return { valid: true };
}

/**
 * Validate the number of steps inside a movement command.
 */
export function validateCount(value: string): { valid: boolean; error?: string; num?: number } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, error: '步数不能为空' };
  if (!/^\d+$/.test(trimmed)) return { valid: false, error: '步数必须是整数' };
  const num = parseInt(trimmed, 10);
  if (num < 1 || num > 20) return { valid: false, error: '步数必须在 1-20 之间' };
  return { valid: true, num };
}

/**
 * Validate the full template and expand to command list.
 */
export function validateAndExpand(
  rows: TemplateRow[],
  config: PythonConfig,
): ValidationResult {
  if(config.robot) return expandRobotRows(rows,config);
  const errors: string[] = [];

  // Row count check
  if (rows.length < 1) {
    errors.push('至少需要 1 行指令');
  }
  if (rows.length > config.max_rows) {
    errors.push(`最多 ${config.max_rows} 行/段`);
  }

  const expanded: Direction[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dirResult = validateDirection(row.direction);
    if (!dirResult.valid) {
      errors.push(`第 ${i + 1} 段: ${dirResult.error}`);
      continue;
    }

    if (row.count === null || row.count === undefined) {
      errors.push(`第 ${i + 1} 行: 缺少步数`);
      continue;
    }
    const countResult = validateCount(row.count);
    if (!countResult.valid || countResult.num === undefined) {
      errors.push(`第 ${i + 1} 行: ${countResult.error}`);
      continue;
    }
    for (let j = 0; j < countResult.num; j++) {
      expanded.push(row.direction.trim().toLowerCase() as Direction);
    }
  }

  // Command limit check
  if (expanded.length === 0) {
    errors.push('程序至少需要 1 步');
  }
  if (expanded.length > 256) {
    errors.push(`展开后最多 256 步，当前 ${expanded.length} 步`);
  }

  return {
    valid: errors.length === 0,
    errors,
    expanded: errors.length === 0 ? expanded : undefined,
  };
}

/**
 * Generate the display Python source from template rows.
 */
export function generatePythonSource(rows: TemplateRow[], config: PythonConfig): string {
  if(config.robot) {
    const source=(items:TemplateRow[],depth=0):string=>items.map(r=>`${'    '.repeat(depth)}${r.direction==='repeat'?`for i in range(${r.count || '?' }):\n${source(r.children??[],depth+1)}`:`${r.direction}(${['forward','backward','wait'].includes(r.direction)?r.count||'?':''})`}`).join('\n');
    return source(rows)+'\n';
  }
  void config;
  return rows.map(r => `move_${r.direction || '???'}(${r.count ?? '?'})`).join('\n') + '\n';
}

function expandRobotRows(rows:TemplateRow[], config:PythonConfig):ValidationResult {
  const errors:string[]=[],expanded:Action[]=[];
  let totalRows=0;
  const walk=(items:TemplateRow[],depth:number):Action[]=>{
    const out:Action[]=[];
    if(!items.length) errors.push('指令块不能为空');
    if(depth>3) {errors.push('循环最多嵌套 3 层');return out;}
    for(const row of items) {
      totalRows++;
      if(totalRows>config.max_rows) {errors.push(`最多 ${config.max_rows} 行指令`);break;}
      if(row.direction==='repeat') {
        const count=validateCount(row.count??'');
        const body=walk(row.children??[],depth+1);
        if(!count.valid) errors.push('循环次数须为 1—20');
        else for(let i=0;i<count.num! && out.length<=256;i++) out.push(...body);
      } else if(ROBOT_ACTIONS.includes(row.direction as never) && config.allowed_functions.includes(row.direction)) {
        const needsCount=['forward','backward','wait'].includes(row.direction);
        const count=needsCount?validateCount(row.count??''):{valid:true,num:1};
        if(!count.valid) errors.push('前进、后退的步数须为 1—20');
        else for(let i=0;i<count.num!;i++) out.push(row.direction as Action);
      } else errors.push('存在不可用的指令');
      if(out.length>256) {errors.push('循环展开后最多 256 条指令');break;}
    }
    return out;
  };
  expanded.push(...walk(rows,0));
  return {valid:errors.length===0,errors:[...new Set(errors)],expanded:errors.length?undefined:expanded};
}

/**
 * Generate initial rows for a level's Python template.
 */
export function generateInitialRows(config: PythonConfig): TemplateRow[] {
  if(config.robot)return [{row_id:createUuid(),direction:'repeat',count:'',children:[]}];
  return [];
}
