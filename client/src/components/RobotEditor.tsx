import { useState } from 'react';
import { createUuid, countCodeLines, type TemplateRow } from '@coin-path/shared';
import './PythonEditor.css';
import './RobotEditor.css';
const commands=[['forward','前进'],['backward','后退'],['turn_left','左转'],['turn_right','右转'],['grab','夹取'],['release','松开'],['wait','等待']] as const;
interface Props { rows:TemplateRow[];onChange:(rows:TemplateRow[])=>void;onRun:()=>void;onReset:()=>void;isRunning:boolean;error:string|null;optimalLines?:number;completedLines:number|null;factory?:boolean; }
export default function RobotEditor({rows,onChange,onRun,onReset,isRunning,error,optimalLines,completedLines,factory=false}:Props) {
  const [target,setTarget]=useState<string|null>(()=>rows.find(r=>r.direction==='repeat')?.row_id??null);
  const map=(items:TemplateRow[],id:string,fn:(row:TemplateRow)=>TemplateRow|null):TemplateRow[]=>items.flatMap(r=>r.row_id===id ? [fn(r)].filter((r):r is TemplateRow=>!!r) : [{...r,children:r.children?map(r.children,id,fn):undefined}]);
  const add=(direction:string)=>{
    const row:TemplateRow={row_id:createUuid(),direction,count:'1',...(direction==='repeat'?{children:[]}: {})};
    const loop=rows.find(r=>r.row_id===target&&r.direction==='repeat')??rows.find(r=>r.direction==='repeat');
    if(loop) {onChange(map(rows,loop.row_id,r=>({...r,children:[...r.children??[],row]})));setTarget(loop.row_id);}
    else {
      const loop:TemplateRow={row_id:createUuid(),direction:'repeat',count:'',children:[row]};
      onChange([...rows,loop]);setTarget(loop.row_id);
    }
  };
  const render=(items:TemplateRow[])=>items.map(row=>row.direction==='repeat'?<div className={`robot-loop ${target===row.row_id?'selected':''}`} key={row.row_id} data-row-id={row.row_id}>
    <div className="loop-title"><button disabled={isRunning} onClick={()=>setTarget(row.row_id)}>循环</button><input aria-label="循环次数" value={row.count??''} disabled={isRunning} inputMode="numeric" maxLength={2} onChange={e=>onChange(map(rows,row.row_id,r=>({...r,count:e.target.value})))} /><span>次</span><button disabled={isRunning} aria-label="删除循环" onClick={()=>{onChange(map(rows,row.row_id,()=>null));setTarget(rows.find(r=>r.row_id!==row.row_id&&r.direction==='repeat')?.row_id??null);}}>×</button></div>
    <code>for i in range({row.count || '?'}):</code><div className="loop-body">{render(row.children??[])}{!row.children?.length&&<small>点击上方指令，加入循环</small>}</div>
  </div>:<div key={row.row_id} className="robot-code-row" data-row-id={row.row_id}><code>{row.direction}(</code>{['forward','backward','wait'].includes(row.direction)&&<input value={row.count??''} disabled={isRunning} aria-label={`${row.direction} ${row.direction==='wait'?'拍数':'步数'}`} inputMode="numeric" maxLength={2} onChange={e=>onChange(map(rows,row.row_id,r=>({...r,count:e.target.value})))} />}<code>)</code><button disabled={isRunning} aria-label="删除指令" onClick={()=>onChange(map(rows,row.row_id,()=>null))}>×</button></div>);
  return <section className="python-editor robot-editor" aria-label="循环代码编辑器"><div className="editor-header"><h3>循环程序</h3><button className="robot-restart" disabled={isRunning} onClick={onReset} data-track-id="python.restart">重新开始</button></div>
    <div className="code-line-metrics" data-track-id="python.line-count" title="每条指令算 1 行，循环头算 1 行；循环次数和移动步数不增加代码行数。目标依据参考解设置。"><span>当前 <b>{countCodeLines(rows)}</b> 行</span>{optimalLines!==undefined&&<span>最优目标 <b>{optimalLines}</b> 行</span>}</div>
    {completedLines!==null&&optimalLines!==undefined&&<p className="code-line-result" role="status" data-track-id="python.line-result">{completedLines<=optimalLines?`已完成 · ${completedLines} 行${completedLines<optimalLines?'，优于目标':'，达成最优目标'}`:`已完成 · 本轮 ${completedLines} 行，试试精简到 ${optimalLines} 行`}</p>}
    <div className="robot-palette">{commands.filter(([id])=>id!=='wait'||factory).map(([id,label])=><button key={id} disabled={isRunning} onClick={()=>add(id)} data-track-id={`python.command.add.${id}`}><b>{factory&&id==='grab'?'拉杆':factory&&id==='release'?'复位':label}</b><code>{id}()</code></button>)}</div>
    <small className="robot-editor-target">{target?'当前添加到选中的循环内':'点击指令，开始填写循环'}</small>
    <div className="robot-code">{render(rows)}{!rows.length&&<p>点击上方指令，开始填写循环</p>}</div>
    {error&&<p role="alert" className="editor-error">{error}</p>}<button className="run-btn" disabled={isRunning} onClick={onRun} data-track-id="python.run">{isRunning?'正在执行…':'▶ 运行程序'}</button>
  </section>;
}
