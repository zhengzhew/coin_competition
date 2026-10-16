import type { ReactNode } from 'react';
import type { ThirdSnapshot } from '@coin-path/shared';
import MapStatus from '../components/MapStatus';

export default function StrawberryStatus({ state, children }: { state: ThirdSnapshot; children?: ReactNode }) {
  const heading = Math.round(state.heading / (Math.PI / 2)) % 4;
  return <MapStatus position={`(${state.x}, ${7 - state.z})`} heading={`${['↑', '→', '↓', '←'][heading]} ${['朝上', '朝右', '朝下', '朝左'][heading]}`} cargo={state.holding ? '携带 1 株草莓' : '夹爪空闲'}>{children}</MapStatus>;
}
