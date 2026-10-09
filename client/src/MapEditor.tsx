import { useEffect, useRef, useState } from 'react';
import { createGameState, step, solve, type Action, type GameState, type LevelDef, type Direction } from '@coin-path/shared';
import { blank, clone, parseMap, problems, same, templates } from './map-editor-model';
import './MapEditor.css';

const storageKey = 'competition-map-editor-v1';
type Tool = 'start' | 'wall' | 'coin' | 'chest' | 'platform' | 'delivery' | 'checkpoint' | 'erase';
const labels: Record<Tool,string> = {start:'起点',wall:'障碍',coin:'金币',chest:'宝箱',platform:'平台',delivery:'泊位',checkpoint:'打卡点（金币）',erase:'橡皮擦'};
const icons: Record<Tool,string> = {start:'↟',wall:'▦',coin:'●',chest:'◆',platform:'▧',delivery:'◎',checkpoint:'◉',erase:'⌫'};
const arrows = {up:'↑',right:'→',down:'↓',left:'←'};
function initial() {try {const saved=localStorage.getItem(storageKey);return saved ? parseMap(JSON.parse(saved)) : blank();} catch {return blank();}}

export interface MapEditorProps { embedded?: boolean }

export default function MapEditor({ embedded = false }: MapEditorProps) {
  const Container = embedded ? 'section' : 'main';
  const Heading = embedded ? 'h2' : 'h1';
  const [level,setLevel] = useState<LevelDef>(initial);
  const [tool,setTool] = useState<Tool>('coin');
  const [letter,setLetter] = useState('A');
  const [elevation,setElevation] = useState(0);
  const [past,setPast] = useState<LevelDef[]>([]), [future,setFuture] = useState<LevelDef[]>([]);
  const [preview,setPreview] = useState<GameState|null>(null);
  const [notice,setNotice] = useState('选择一种元素，再点击地图上的格子。');
  const [saved,setSaved] = useState('');
  const [template,setTemplate] = useState('');
  const upload=useRef<HTMLInputElement>(null);
  const robot=Boolean(level.robot), issues=problems(level);
  const facing=level.robot?.facing ?? level.initial_facing ?? 'up';
  useEffect(()=>{if(!embedded)document.title='地图工坊 · 测试赛地图编辑器';},[embedded]);
  useEffect(()=>{try {localStorage.setItem(storageKey,JSON.stringify(level));setSaved('草稿已保存在本机');} catch {setSaved('本机保存不可用，请导出备份');}},[level]);
  const change=(next:LevelDef)=>{setPast(p=>[...p.slice(-49),clone(level)]);setFuture([]);setLevel(next);setPreview(null);setNotice('地图已更新。');};
  const update=(fn:(draft:LevelDef)=>void)=>{
    const draft=clone(level);fn(draft);delete draft.expected_optimal_steps;delete draft.expected_max_value;
    if(draft.robot?.checkpoint_order){
      const ids=draft.coins.filter(c=>c.type==='checkpoint').map(c=>c.id);
      const previous=draft.robot.checkpoint_order.filter(id=>ids.includes(id));
      draft.robot.checkpoint_order=ids.length?[...previous,...ids.filter(id=>!previous.includes(id))]:undefined;
    }
    change(draft);
  };
  const undo=()=>{if(!past.length)return;setFuture(f=>[clone(level),...f]);setLevel(past[past.length-1]);setPast(p=>p.slice(0,-1));setPreview(null);};
  const redo=()=>{if(!future.length)return;setPast(p=>[...p,clone(level)]);setLevel(future[0]);setFuture(f=>f.slice(1));setPreview(null);};
  const paint=(x:number,y:number)=>{
    if(preview)return;
    const p:[number,number]=[x,y];
    if (tool!=='start' && !(robot&&tool==='checkpoint') && same(level.start,p)) {setNotice('这里是起点，请先用起点工具把它移到其他格子。机器人起点也可以放置打卡点。');return;}
    if ((tool==='coin'||tool==='chest'||tool==='checkpoint') && (!robot||tool==='checkpoint') && level.coins.length>=8 && !level.coins.some(c=>same(c.position,p))) {setNotice('一张地图最多放置 8 个目标。');return;}
    update(d=>{
      if(tool==='platform' && d.robot) {d.robot.cells=d.robot.cells.filter(c=>!same(c,p));d.robot.cells.push([x,y,elevation]);return;}
      d.walls=d.walls.filter(c=>!same(c,p));
      d.coins=d.coins.filter(c=>!same(c.position,p));
      if(d.robot) for(const [id,pos] of Object.entries(d.robot.deliveries)) if(same(pos,p)) delete d.robot.deliveries[id];
      if(tool==='erase') {if(d.robot)d.robot.cells=d.robot.cells.filter(c=>!same(c,p));}
      else {
        if(d.robot && !d.robot.cells.some(c=>same(c,p))) d.robot.cells.push([x,y,elevation]);
        if(tool==='start')d.start=p;
        if(tool==='wall')d.walls.push(p);
        if(tool==='coin'||tool==='chest'||tool==='checkpoint') {
          const id=robot&&tool!=='checkpoint'?letter:'ABCDEFGH'.split('').find(id=>!d.coins.some(c=>c.id===id))!;
          d.coins=d.coins.filter(c=>c.id!==id);
          d.coins.push({id,position:p,value:tool==='chest'?3:1,type:tool==='checkpoint'?'checkpoint':tool==='chest'?'chest':'coin'});
        }
        if(tool==='delivery' && d.robot)d.robot.deliveries[letter]=p;
      }
      if(d.required_order)d.required_order=d.coins.map(c=>c.id);
    });
  };
  const resize=(axis:'width'|'height',value:number)=>{
    if(!Number.isInteger(value)||value<3||value>(axis==='width'?24:16)){setNotice(`${axis==='width'?'宽度':'高度'}请输入 3–${axis==='width'?24:16} 之间的整数。`);return false;}
    if(value===level[axis])return true;
    const w=axis==='width'?value:level.width,h=axis==='height'?value:level.height;
    const inside=(p:number[])=>p[0]<w&&p[1]<h;
    update(d=>{
      d.width=w;d.height=h;
      d.walls=d.walls.filter(inside);
      d.coins=d.coins.filter(c=>inside(c.position));
      if(d.robot){
        d.robot.cells=d.robot.cells.filter(inside);
        // Fill only the newly added area; preserve holes within the existing map.
        for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x>=level.width||y>=level.height)d.robot.cells.push([x,y,elevation]);
        d.robot.deliveries=Object.fromEntries(Object.entries(d.robot.deliveries).filter(([id,p])=>inside(p)&&d.coins.some(c=>c.id===id&&c.type!=='checkpoint')));
      }
      if(!inside(d.start)){
        const preferred:[number,number]=[Math.min(d.start[0],w-1),Math.min(d.start[1],h-1)];
        const candidates:[number,number][]=[preferred,...Array.from({length:w*h},(_,i)=>[i%w,Math.floor(i/w)] as [number,number])];
        const hasTarget=(p:number[])=>d.coins.some(c=>same(c.position,p))||Object.values(d.robot?.deliveries??{}).some(c=>same(c,p));
        d.start=candidates.find(p=>!hasTarget(p)&&!d.walls.some(c=>same(c,p)))??candidates.find(p=>!hasTarget(p))??preferred;
        d.walls=d.walls.filter(p=>!same(p,d.start));
        d.coins=d.coins.filter(c=>!same(c.position,d.start));
        if(d.robot)d.robot.deliveries=Object.fromEntries(Object.entries(d.robot.deliveries).filter(([id,p])=>!same(p,d.start)&&d.coins.some(c=>c.id===id&&c.type!=='checkpoint')));
      }
      if(d.robot&&!d.robot.cells.some(p=>same(p,d.start)))d.robot.cells.push([...d.start,elevation]);
      if(d.required_order)d.required_order=d.required_order.filter(id=>d.coins.some(c=>c.id===id));
    });
    setNotice(`地图已调整为 ${w} × ${h}。${w<level.width||h<level.height?'界外元素已裁剪，货物泊位配对请重新检查；可点“撤销”恢复。':robot?'新增区域已铺设平台。':''}`);
    return true;
  };
  const check=()=>{
    if(issues.length){setNotice(issues.join(' '));return false;}
    if(!robot) {
      const path=solve(level,level.required_order);
      if(!path){setNotice('存在无法收集的目标，请调整障碍或目标位置。');return false;}
      setNotice(`地图可通关，收齐最短 ${path.length} 步。${level.step_limit&&path.length>level.step_limit?'当前步数预算不足以收齐，可作为限步取分地图。':''}`);
    } else setNotice('结构检查通过。请试走确认打卡点可到达，货物能被夹取、运输并送达；结构检查不代表可通关。');
    return true;
  };
  const exportMap=()=>{
    if(!check())return;
    const result=clone(level);delete result.expected_optimal_steps;delete result.expected_max_value;
    if(!robot)result.expected_optimal_steps=solve(level,level.required_order)?.length;
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`${level.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'地图'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const action=(direction:Action)=>setPreview(s=>s?step(s,{direction,command_index:s.consumed_commands,command_id:`editor-${s.consumed_commands}`,source:'keyboard'},level.required_order,level.coins.length,level.max_commands,level.step_limit).state:s);
  const tools:Tool[]=robot?['start','platform','wall','coin','delivery','checkpoint','erase']:['start','coin','chest','checkpoint','wall','erase'];
  return <Container className={`map-editor ${embedded?'me-embedded':'me-standalone'} ${robot?'me-future':''}`} aria-label="地图编辑器">
    <header className="me-header">{embedded?<span className="me-logo" aria-hidden="true">▦</span>:<a className="me-logo" href="/" aria-label="返回旷野淘金">▦</a>}<div><small>COMPETITION / MAP STUDIO</small><Heading>地图工坊<span>绘制 · 检查 · 试走</span></Heading></div><div className="me-top-actions"><span>{saved}</span><button onClick={()=>upload.current?.click()}>导入 JSON</button><button className="me-primary" onClick={exportMap}>导出地图 ↗</button></div></header>
    {level.robot?.checkpoint_order&&<div className="me-order-note">打卡顺序：{level.robot.checkpoint_order.join(' → ')}。提前经过尚未轮到的打卡点不会计入完成。</div>}
    <input hidden ref={upload} type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>1024*1024)throw new Error('文件请小于 1 MB。');const next=parseMap(JSON.parse(await file.text()));change(next);setTool('coin');setNotice('地图已导入。导入关卡包时载入第一张地图。');}catch(error){setNotice(`导入失败：${error instanceof Error?error.message:'无效文件'}`);}}}/>
    <div className="me-layout"><aside className="me-sidebar">
      <section><div className="me-section-title"><b>01</b><h2>选择测试赛</h2></div><div className="me-mode"><button aria-pressed={!robot} onClick={()=>{if(robot){change(blank());setTool('coin');setTemplate('');}}}>● 旷野淘金<small>移动 · 收集 · 路径规划</small></button><button aria-pressed={robot} onClick={()=>{if(!robot){change(blank(true));setTool('platform');setTemplate('');}}}>✦ 未来城市<small>转向 · 夹取 · 搬运配送</small></button></div>
      <label>从现有关卡开始<select value={template} onChange={e=>setTemplate(e.target.value)}><option value="">选择一张参考地图</option>{templates.filter(l=>Boolean(l.robot)===robot).map(l=><option key={l.level_id} value={l.level_id}>{l.level_id} · {l.title}</option>)}</select></label><button className="me-wide" disabled={!template} onClick={()=>{const source=templates.find(l=>l.level_id===template);if(source){const next=clone(source);next.level_id='CUSTOM01';next.keyboard_id='CUSTOM_K01';next.python_id='CUSTOM_P01';next.content_id='custom_map';next.content_version='1.0.0';change(next);setNotice('已载入参考地图，可以直接修改。');}}}>载入参考地图</button></section>
      <section><div className="me-section-title"><b>02</b><h2>点击放置元素</h2></div><div className="me-tools">{tools.map(t=><button key={t} aria-pressed={tool===t} onClick={()=>{setTool(t);setPreview(null);}}><span>{icons[t]}</span>{t==='coin'&&robot?'货物':labels[t]}</button>)}</div>{robot&&<><label>货物 / 泊位配对字母<select value={letter} onChange={e=>setLetter(e.target.value)}>{'ABCDEFGH'.split('').map(id=><option key={id}>{id}</option>)}</select></label><label>平台高度<select value={elevation} onChange={e=>setElevation(Number(e.target.value))}>{[0,.5,1,1.5,2,2.5,3].map(v=><option value={v} key={v}>{v}</option>)}</select></label></>}<fieldset className="me-facing"><legend>小车初始方向</legend><div>{(Object.keys(arrows) as Direction[]).map(dir=><button key={dir} aria-label={`初始朝向${({up:'上',right:'右',down:'下',left:'左'})[dir]}`} aria-pressed={facing===dir} onClick={()=>update(d=>{d.initial_facing=dir;if(d.robot)d.robot.facing=dir;})}>{arrows[dir]} {({up:'上',right:'右',down:'下',left:'左'})[dir]}</button>)}</div><small>{robot?'前进沿车头方向，后退沿相反方向。':'起点箭头表示初始方向；淘金模式仍按上下左右移动。'}</small></fieldset><p className="me-hint">{robot?'货物需与泊位配对；打卡点（金币）到达即完成，不需要夹取或泊位。':'点击空格添加目标。打卡点（金币）到达即完成；宝箱 3 分，金币 1 分。'}</p></section>
      <section><div className="me-section-title"><b>03</b><h2>设置地图</h2></div><label>地图名称<input value={level.title} maxLength={60} onChange={e=>update(d=>{d.title=e.target.value;})}/></label><div className="me-dimensions"><label>宽度<input key={level.width} type="number" inputMode="numeric" min="3" max="24" step="1" defaultValue={level.width} onBlur={e=>{if(!resize('width',Number(e.currentTarget.value)))e.currentTarget.value=String(level.width);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=String(level.width);e.currentTarget.blur();}}}/></label><span>×</span><label>高度<input key={level.height} type="number" inputMode="numeric" min="3" max="16" step="1" defaultValue={level.height} onBlur={e=>{if(!resize('height',Number(e.currentTarget.value)))e.currentTarget.value=String(level.height);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=String(level.height);e.currentTarget.blur();}}}/></label></div>{!robot&&<><label>收集规则<select value={level.required_order?'ordered':'free'} onChange={e=>update(d=>{d.required_order=e.target.value==='ordered'?d.coins.map(c=>c.id):null;})}><option value="free">自由顺序</option><option value="ordered">按放置顺序收集</option></select></label><label>成功移动步数上限（留空不限）<input type="number" min="1" max="256" value={level.step_limit??''} onChange={e=>{const v=e.target.value;if(v===''||(+v>=1&&+v<=256&&Number.isInteger(+v)))update(d=>{d.step_limit=v===''?null:+v;});}}/></label></>}<label>任务说明<textarea rows={2} value={level.objective} onChange={e=>update(d=>{d.objective=e.target.value;})}/></label></section>
    </aside><section className="me-workspace"><div className="me-canvas-heading"><div><small>{robot?'FUTURE CITY':'GOLDEN WILDERNESS'}</small><h2>{level.title||'未命名地图'}</h2></div><div className="me-history"><button disabled={!past.length} onClick={undo}>↶ 撤销</button><button disabled={!future.length} onClick={redo}>↷ 重做</button><button onClick={()=>change(blank(robot,level.width,level.height))}>新建空白</button></div></div>
    <div className="me-board-wrap"><div className="me-board" role="group" aria-label="地图画布" style={{gridTemplateColumns:`repeat(${level.width}, minmax(32px, 1fr))`,maxWidth:`${level.width*64}px`}}>{Array.from({length:level.width*level.height},(_,i)=>{
      const x=i%level.width,y=level.height-1-Math.floor(i/level.width),p=[x,y];
      const coin=level.coins.find(c=>preview?.robot&&c.type!=='checkpoint'?same(preview.robot.cargo[c.id]??[-1,-1],p):same(c.position,p)&&!preview?.collected.includes(c.id));
      const dock=Object.entries(level.robot?.deliveries??{}).find(([,pos])=>same(pos,p))?.[0];
      const start=preview?preview.x===x&&preview.y===y:same(level.start,p);
      const wall=level.walls.some(c=>same(c,p)),platform=level.robot?.cells.find(c=>same(c,p));
      const kind=wall?'wall':coin?(robot&&coin.type!=='checkpoint'?'cargo':coin.type==='chest'?'chest':'coin'):dock?'dock':robot&&!platform?'void':'ground';
      const caption=start?(coin?.type==='checkpoint'?`起点 / 打卡点 ${coin.id}`:'起点'):wall?'障碍':coin?`${coin.type==='checkpoint'?'打卡点':robot?'货物':coin.type==='chest'?'宝箱':'金币'} ${coin.id}`:dock?`泊位 ${dock}`:kind==='void'?'空洞':'地面';
      return <button key={`${x},${y}`} className={`me-cell me-${kind} ${start?'me-start':''}`} aria-label={`${x},${y} ${caption}`} onClick={()=>paint(x,y)} disabled={Boolean(preview)}><small>{x},{y}</small><span>{start?arrows[preview?.robot?.facing??facing]:wall?'▦':coin?(robot&&coin.type!=='checkpoint'?'▣':coin.type==='chest'?'◆':'●'):dock?'◎':''}</span>{(!start||coin?.type==='checkpoint')&&(coin||dock)&&<b>{coin?.id??dock}</b>}{robot&&platform&&platform[2]>0&&<em>{platform[2]}</em>}</button>;
    })}</div></div>
    <div className="me-board-footer"><span>原点在左下角 · x 向右，y 向上</span><span>{level.width} × {level.height} 网格 · {level.coins.length} 个目标 · {level.walls.length} 个障碍</span></div>
    <div className="me-bottom"><section className="me-check-panel"><h3>检查与试走</h3><p role="status">{notice}</p><div className="me-button-row"><button onClick={check}>检查地图</button><button className="me-primary" onClick={()=>{if(preview){setPreview(null);return;}if(check())setPreview(createGameState(level));}}>{preview?'返回编辑':'▶ 开始试走'}</button></div><small>试走仅在本机运行，不产生比赛成绩。导出的地图需接入关卡配置后才能用于正式测试赛。</small></section>
    <section className="me-target-panel"><h3>{preview?'试走控制':'目标清单'}</h3>{preview?<><div className="me-play-buttons">{(robot?[['forward','前进'],['backward','后退'],['turn_left','左转'],['turn_right','右转'],['grab','夹取'],['release','松开']]:[['up','↑ 上'],['left','← 左'],['down','↓ 下'],['right','→ 右']]).map(([a,label])=><button key={a} disabled={preview.status!=='running'} onClick={()=>action(a as Action)}>{label}</button>)}<button onClick={()=>setPreview(createGameState(level))}>重新试走</button></div><p>{preview.status==='success'?'✓ 已完成':preview.status==='command_limit'?'命令已用完':preview.status==='incomplete'?'步数预算已用完':'试走中'} · {preview.steps} 步 · {preview.collisions} 次碰撞 · 完成 {preview.collected.length}/{level.coins.length}{preview.robot?.holding?` · 正夹持 ${preview.robot.holding}`:''}</p></>:<><div className="me-targets">{level.coins.length?level.coins.map(c=><span key={c.id}><b>{c.id}</b>{c.type==='checkpoint'?'到达即完成':robot?(level.robot!.deliveries[c.id]?'泊位已配对':'缺少泊位'):`${c.value??1} 分`}</span>):<p>地图还是空白，从放置第一个目标开始。</p>}</div>{level.required_order&&<p>收集顺序：{level.required_order.join(' → ')}</p>}<small>{robot?'搬运前需在货物相邻格面向货物，夹爪作用于车头前一格。':'目标按放置顺序自动编号 A–H；自由顺序下可自行规划路线。'}</small></>}</section></div>
    </section></div>
  </Container>;
}
