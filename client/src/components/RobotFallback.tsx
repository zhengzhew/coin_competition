import type { LevelDef, GameState } from '@coin-path/shared';
import {robotSceneBounds} from './robot-scene-bounds';
import {robotSceneTheme,cargoColor} from './robot-scene-theme';
export default function RobotFallback({level,state}:{level:LevelDef;state:GameState}) {
  const robot=state.robot!,theme=robotSceneTheme(level);
  const machine=robot.config.automation,live=robot.automation;
  const cart=machine&&live?machine.cart_path[live.tick%machine.cart_path.length]:null;
  const y=(n:number)=>level.height-n;
  const bounds=robotSceneBounds(level);
  const occupied=new Set([...level.robot!.cells,...level.walls,...level.coins.map(c=>c.position),level.start,...Object.values(level.robot!.deliveries)].map(p=>`${p[0]},${p[1]}`));
  return <svg className="robot-fallback" data-scene-theme={theme.id} viewBox={`${bounds.left} ${y(bounds.bottom+bounds.height)} ${bounds.width} ${bounds.height}`} style={{width:'100%',height:'100%',minHeight:220,background:theme.sky}} aria-label={`${theme.name}，水滴为巡逻点，方箱为货物，虚线框为交货点，三角为车头`}>
    <rect x={bounds.left} y={y(bounds.bottom+bounds.height)} width={bounds.width} height={bounds.height} rx=".15" fill={theme.ground}/>
    {theme.props.filter(([,x,cy])=>!occupied.has(`${x},${cy}`)&&x>=bounds.minX&&x<=bounds.maxX&&cy>=bounds.minY&&cy<=bounds.maxY).map(([kind,x,cy])=><g key={`${x},${cy}`} transform={`translate(${x} ${y(cy)})`}>
      {['tree','flowers','fountain'].includes(kind)?<><circle r=".34" fill={kind==='fountain'?'#57c5d4':'#6cad74'}/><circle cx="-.1" cy="-.1" r=".16" fill={kind==='fountain'?'#c4eeea':'#a9cf80'}/></>:<><rect x="-.35" y="-.35" width=".7" height=".7" rx=".08" fill={theme.trim}/><path d="M -.26 0 L .26 0 M 0 -.26 L 0 .26" stroke="#f5f6e5" strokeWidth=".06"/></>}
    </g>)}
    {level.robot!.cells.map(([x,cy])=><rect key={`${x},${cy}`} x={x-.48} y={y(cy)-.48} width=".96" height=".96" fill={theme.road} stroke={theme.trim} strokeWidth=".03"/>)}
    {machine&&<g aria-label="自动化产线">
      {machine.belt.map(([x,cy],i)=><g key={`${x},${cy}`}><rect x={x-.46} y={y(cy)-.46} width=".92" height=".92" fill="#709faa" stroke="#d8e8e4" strokeWidth=".04"/><text x={x} y={y(cy)+.1} textAnchor="middle" fill="#fff" fontSize=".4">{i<6?'›':'‹'}</text></g>)}
      <path d={`M ${machine.cart_path[0][0]} ${y(machine.dock[1])} H ${Math.max(...machine.cart_path.map(p=>p[0]))}`} stroke="#69898e" strokeWidth=".3"/>
      {cart&&<rect x={cart[0]-.4} y={y(cart[1])-.32} width=".8" height=".64" rx=".08" fill="#f0bc64" stroke="#458b9b" strokeWidth=".08"/>}
      <rect x={machine.switch[0]-.35} y={y(machine.switch[1])-.32} width=".7" height=".64" rx=".08" fill={robot.closed?'#dd8670':'#f2d58d'}/><text x={machine.switch[0]} y={y(machine.switch[1])+.13} textAnchor="middle" fontSize=".4" fill="#6a4d2b">G</text>
    </g>}
    {Object.entries(level.robot!.deliveries).map(([id,[x,cy]])=><g key={id} aria-label={`交货点 ${id}${state.collected.includes(id)?' 已送达':''}`}>
      <rect x={x-.42} y={y(cy)-.42} width=".84" height=".84" rx=".07" fill="#fff6dc" stroke={state.collected.includes(id)?'#289a6c':cargoColor(id)} strokeDasharray=".16 .06" strokeWidth=".055"/>
      <text x={x} y={y(cy)+.12} textAnchor="middle" fontSize=".34" fontWeight="800" fill={cargoColor(id)}>↓ {id}</text>
    </g>)}
    {Object.entries(robot.checkpoints??{}).map(([id,[x,cy]])=><g key={id} transform={`translate(${x} ${y(cy)})`} aria-label={`巡逻点${level.robot?.checkpoint_order?' '+id:''}${state.collected.includes(id)?' 已完成':''}`}>
      <path d="M 0 .43 L -.29 .01 A .34 .34 0 1 1 .29 .01 Z" fill={state.collected.includes(id)?'#289a6c':'#078fae'} stroke="#fff" strokeWidth=".045"/>
      <text y="-.02" textAnchor="middle" dominantBaseline="middle" fontSize=".34" fontWeight="800" fill="#fff">{level.robot?.checkpoint_order?id:'●'}</text>
      {state.collected.includes(id)&&<text x=".26" y="-.3" fontSize=".25" fontWeight="800" fill="#208656" stroke="#fff" strokeWidth=".025" paintOrder="stroke">✓</text>}
    </g>)}
    {level.walls.map(([x,cy],i)=><g key={`${x},${cy}`} transform={`translate(${x} ${y(cy)})`}>
      <rect x="-.4" y="-.4" width=".8" height=".8" rx=".06" fill={theme.id==='energy'?'#608aac':theme.trim}/>
      <path d={theme.wall[i%theme.wall.length]==='turbine'?'M 0 -.3 L 0 .3 M -.3 0 L .3 0':'M -.23 -.22 L -.23 .22 M 0 -.22 L 0 .22 M .23 -.22 L .23 .22'} stroke="#eff7e8" strokeWidth=".06"/>
    </g>)}
    {Object.entries({...robot.cargo,...Object.fromEntries(state.collected.filter(id=>robot.config.deliveries[id]).map(id=>[id,cart&&live?.cart_cargo===id?cart:robot.config.deliveries[id]]))}).map(([id,[x,cy]])=><g key={id} aria-label={`货物 ${id}`}>
      <rect x={x-.3} y={y(cy)-.3} width=".6" height=".6" rx=".055" fill="#f2bd68" stroke={cargoColor(id)} strokeWidth=".065"/>
      <text x={x} y={y(cy)+.12} textAnchor="middle" fontSize=".35" fontWeight="800" fill="#633f1c">{id}</text>
      {state.collected.includes(id)&&<text x={x+.22} y={y(cy)-.24} fontSize=".26" fontWeight="800" fill="#208656" stroke="#fff" strokeWidth=".035" paintOrder="stroke">✓</text>}
    </g>)}
    <g transform={`translate(${state.x} ${y(state.y)}) rotate(${{up:0,right:90,down:180,left:270}[robot.facing]})`}><path d="M 0 -.42 L .3 .3 L -.3 .3 Z" fill="#338eac" stroke="#fff" strokeWidth=".05"/>{robot.holding&&<rect x="-.16" y="-.7" width=".32" height=".25" fill="#f2bd68" stroke={cargoColor(robot.holding)} strokeWidth=".035"/>}</g>
  </svg>;
}
