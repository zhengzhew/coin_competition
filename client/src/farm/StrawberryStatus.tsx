import type { ReactNode } from 'react';
import type { ThirdSnapshot } from '@coin-path/shared';

export default function StrawberryStatus({ state, children }: { state: ThirdSnapshot; children?: ReactNode }) {
  const heading = Math.round(state.heading / (Math.PI / 2)) % 4;
  return <div className="farm-scene-status" aria-label="小车状态">
    <div className="farm-car-position"><small>位置</small><b>({state.x}, {7 - state.z})</b><span className="farm-car-heading"><i aria-hidden="true">{['↑', '→', '↓', '←'][heading]}</i>{['朝上', '朝右', '朝下', '朝左'][heading]}</span></div>
    <div className={`farm-gripper-state${state.holding ? ' is-holding' : ''}`}><i aria-hidden="true" />{state.holding ? '携带 1 株草莓' : '夹爪空闲'}</div>
    {children}
  </div>;
}
