import { useRef, useState } from 'react';
import { createUuid, type TemplateRow } from '@coin-path/shared';
import './PythonEditor.css';
import './RobotEditor.css';
import { CompetitionActions } from './CompetitionTemplate';
import { useExecutingRow } from './useExecutingRow';
import { programLineNumbers } from '../program-execution';
const commands=[['forward','前进'],['backward','后退'],['turn_left','左转'],['turn_right','右转'],['grab','夹取'],['release','松开'],['wait','等待']] as const;
interface Props { paused:boolean;onPause:()=>void;rows:TemplateRow[];onChange:(rows:TemplateRow[])=>void;onRun:()=>void;onReset:()=>void;onStop:()=>void;canReset:boolean;executing:boolean;activeRowId:string|null;isRunning:boolean;error:string|null;factory?:boolean; }
export default function RobotEditor({rows,onChange,onRun,onReset,onStop,canReset,executing,activeRowId,isRunning,error,factory=false,paused,onPause}:Props) {
  const cursor = useRef<string|null>(null);
  const viewport = useExecutingRow(activeRowId), lineNumbers = programLineNumbers(rows);
  const [target,setTarget]=useState<string|null>(()=>rows.find(r=>r.direction==='repeat')?.row_id??null);
  const selectedLoopId=rows.some(r=>r.row_id===target&&r.direction==='repeat')?target:rows.find(r=>r.direction==='repeat')?.row_id;
  const map=(items:TemplateRow[],id:string,fn:(row:TemplateRow)=>TemplateRow|null):TemplateRow[]=>items.flatMap(r=>r.row_id===id ? [fn(r)].filter((r):r is TemplateRow=>!!r) : [{...r,children:r.children?map(r.children,id,fn):undefined}]);
  const add=(direction:string)=>{
    const row:TemplateRow={row_id:createUuid(),direction,count:'1',...(direction==='repeat'?{children:[]}: {})};
    if (cursor.current && lineNumbers.has(cursor.current)) {
      const insertAt = (items:TemplateRow[]):TemplateRow[] => items.flatMap(item => item.row_id === cursor.current ? [row, item] : [{...item, children:item.children ? insertAt(item.children) : undefined}]);
      onChange(insertAt(rows)); return;
    }
    const loop=rows.find(r=>r.row_id===target&&r.direction==='repeat')??rows.find(r=>r.direction==='repeat');
    if(loop) {onChange(map(rows,loop.row_id,r=>({...r,children:[...r.children??[],row]})));setTarget(loop.row_id);}
    else {
      const loop:TemplateRow={row_id:createUuid(),direction:'repeat',count:'',children:[row]};
      onChange([...rows,loop]);setTarget(loop.row_id);
    }
  };
  const render=(items:TemplateRow[])=>items.map(row=>row.direction==='repeat'?<div className={`robot-loop ${selectedLoopId===row.row_id?'selected':''}`} key={row.row_id} data-row-id={row.row_id}>
    <div className="loop-title"><button disabled={isRunning} onClick={()=>{setTarget(row.row_id);cursor.current=null;}}>循环</button><input aria-label="循环次数" value={row.count??''} disabled={isRunning} inputMode="numeric" maxLength={2} onChange={e=>onChange(map(rows,row.row_id,r=>({...r,count:e.target.value})))} /><span>次</span><button disabled={isRunning} aria-label="删除循环" onClick={()=>{onChange(map(rows,row.row_id,()=>null));setTarget(rows.find(r=>r.row_id!==row.row_id&&r.direction==='repeat')?.row_id??null);}}>×</button></div>
    <code>for i in range({row.count || '?'}):</code><div className="loop-body">{render(row.children??[])}{!row.children?.length&&<small>点击上方指令，加入循环</small>}</div>
  </div>:<div onMouseEnter={()=>{cursor.current=row.row_id;}} onFocus={()=>{cursor.current=row.row_id;}} onClick={()=>{cursor.current=row.row_id;}} key={row.row_id} className={`robot-code-row${activeRowId===row.row_id?' is-executing':''}`} data-row-id={row.row_id} data-testid={activeRowId===row.row_id?'running-code-line':undefined}><span className="row-number">{lineNumbers.get(row.row_id)}</span><code>{row.direction}(</code>{['forward','backward','wait'].includes(row.direction)&&<input value={row.count??''} disabled={isRunning} aria-label={`${row.direction} ${row.direction==='wait'?'拍数':'步数'}`} inputMode="numeric" maxLength={2} onChange={e=>onChange(map(rows,row.row_id,r=>({...r,count:e.target.value})))} />}<code>)</code><button disabled={isRunning} aria-label="删除指令" onClick={()=>onChange(map(rows,row.row_id,()=>null))}>×</button></div>);
  return <section className="python-editor robot-editor" aria-label="循环代码编辑器"><div className="editor-header"><h3>指令程序</h3><span className="editor-hint">{activeRowId ? `执行第 ${lineNumbers.get(activeRowId)} 行` : `按格移动 · 转向 90°${factory ? ' / 拍' : ''}`}</span></div>
    <div className="robot-palette" aria-label="可用指令">{commands.filter(([id])=>id!=='wait'||factory).map(([id,label])=><button key={id} disabled={isRunning} title={`${id}()`} onClick={()=>add(id)} data-track-id={`python.command.add.${id}`}><b>{factory&&id==='grab'?'拉杆':factory&&id==='release'?'复位':label}</b><code>{id}()</code></button>)}</div>

    <div className="robot-code" ref={viewport}>{render(rows)}{!rows.length&&<p>点击上方指令，开始填写循环</p>}</div>
    {error&&<p role="alert" className="editor-error">{error}</p>}<CompetitionActions running={executing} paused={paused} onPause={onPause} busy={isRunning} canReset={canReset} onRun={onRun} onStop={onStop} onReset={onReset} runTrack="python.run" stopTrack="attempt.stop" />
  </section>;
}
