import {DIRECTIONS,type GameState,type LevelDef} from '@coin-path/shared';
export default function FactoryStatus({level,state}:{level:LevelDef;state:GameState}) {
  const machine=level.robot?.automation,live=state.robot?.automation;
  if(!machine||!live||!state.robot)return null;
  if(state.status==='success')return <div className="factory-status ready" data-track-id="factory.status" data-ready="false" data-tick={live.tick}><span>第 <b>{live.tick}</b> 拍</span><strong>装车完成 · 3 / 3</strong></div>;
  const cargo=Object.entries(state.robot.cargo).find(([,p])=>p[0]===machine.loading[0]&&p[1]===machine.loading[1])?.[0];
  const cart=machine.cart_path[live.tick%machine.cart_path.length];
  const aligned=cart[0]===machine.dock[0]&&cart[1]===machine.dock[1];
  const [dx,dy]=DIRECTIONS[state.robot.facing];
  const ready=!!cargo&&aligned&&!state.robot.closed&&state.x+dx===machine.switch[0]&&state.y+dy===machine.switch[1];
  return <div className={`factory-status ${ready?'ready':''}`} data-track-id="factory.status" data-ready={ready} data-tick={live.tick}>
    <span>第 <b>{live.tick}</b> 拍</span><span>货物 {cargo??'途中'}</span><span>{aligned?'物流车到位':'物流车未到位'}</span><strong>{state.robot.closed?'R 复位':ready?'G 拉杆':'空格推进一拍'}</strong>
  </div>;
}
