import { useId } from 'react';
import type { ThirdSnapshot } from '@coin-path/shared';

export default function StrawberryBoard({ state }: { state: ThirdSnapshot }) {
  const id = useId().replace(/:/g, ''), berryId = `${id}-berry`;
  const count = state.objects.length - state.collected.length - Number(!!state.holding);
  const facing = ['朝上', '朝右', '朝下', '朝左'][Math.round(state.heading / (Math.PI / 2)) % 4];
  return <div className="strawberry-board">
    <div className="strawberry-legend"><span><i className="edge-key" />任意边缘可交付</span><span>8 × 8 棋盘 · 坐标 0–7</span></div>
    <svg viewBox="0 0 600 594" role="img" aria-label={`草莓棋盘，剩余 ${count} 株。小车坐标 (${state.x}, ${7 - state.z})，${facing}${state.holding ? '，携带一株草莓' : ''}`} data-testid="strawberry-board">
      <defs><g id={berryId}><path d="M-16-7C-27 4-12 22 0 28 12 22 27 4 16-7 9-15-9-15-16-7Z" fill="#df4c4a" stroke="#af343b" strokeWidth="2" /><path d="M0-12-13-20-9-7-21-8-9 0 0-7 9 0 21-8 9-7 13-20Z" fill="#427641" /><path d="M0-12Q-2-21 4-25" fill="none" stroke="#427641" strokeWidth="3" /><g fill="#ffe5ae"><ellipse cx="-11" cy="4" rx="1.6" ry="2.4" /><ellipse cx="9" cy="5" rx="1.6" ry="2.4" /><ellipse cy="12" rx="1.6" ry="2.4" /><ellipse cy="21" rx="1.4" ry="2" /></g></g></defs>
      <rect x="46" y="22" width="532" height="532" rx="16" fill="#d5e2bc" />
      {Array.from({ length: 64 }, (_, index) => {
        const x = index % 8, z = Math.floor(index / 8), y = 7 - z, edge = x === 0 || x === 7 || z === 0 || z === 7;
        return <rect key={index} x={54 + x * 64} y={30 + z * 64} width="64" height="64" className={`farm-grid-cell${edge ? ' edge' : ''}`} fill={(x + z) % 2 ? '#e2ebd4' : '#f7f5e7'} stroke="#c6d4b4" data-x={x} data-y={y}><title>({x}, {y}){edge ? ' · 边缘交付格' : ''}</title></rect>;
      })}
      <rect x="55" y="31" width="510" height="510" fill="none" stroke="#759357" strokeWidth="3" />
      <rect x="118" y="94" width="384" height="384" fill="none" stroke="#91ad73" strokeWidth="2" strokeDasharray="5 5" />
      {Array.from({ length: 8 }, (_, n) => <g key={n} className="farm-axis"><text x={86 + n * 64} y="576" textAnchor="middle">{n}</text><text x="30" y={72 + (7 - n) * 64} textAnchor="middle">{n}</text></g>)}
      <text x="584" y="576" className="farm-axis-label">X</text><text x="24" y="20" className="farm-axis-label">Y</text>
      {state.objects.filter(o => o.id !== state.holding && !state.collected.includes(o.id)).map(o => <use key={o.id} href={`#${berryId}`} transform={`translate(${86 + o.x * 64} ${60 + o.z * 64})`} data-testid="farm-strawberry" data-x={o.x} data-y={7 - o.z} />)}
      <g className="farm-grid-robot" transform={`translate(${86 + state.x * 64} ${62 + state.z * 64})`} data-testid="farm-car" data-x={state.x} data-y={7 - state.z} data-holding={state.holding || ''}>
        <g transform={`rotate(${state.heading * 180 / Math.PI})`}><path d="M-14-20V-28H-7M14-20V-28H7" stroke="#3b5943" strokeWidth="4" fill="none" strokeLinecap="round" /><rect x="-23" y="-14" width="8" height="32" rx="3" fill="#334b42" /><rect x="15" y="-14" width="8" height="32" rx="3" fill="#334b42" /><rect x="-17" y="-19" width="34" height="41" rx="9" fill="#53874a" stroke="#fcfff5" strokeWidth="2" /><path d="M0-12 8 1H-8Z" fill="#fff5cf" /><rect x="-9" y="9" width="18" height="5" rx="2" fill="#bddba4" /></g>
        {state.holding && <g transform="translate(20 -19)"><circle r="14" fill="#fff8df" stroke="#d3ad4e" strokeWidth="2" /><use href={`#${berryId}`} transform="translate(0 -1) scale(.42)" /></g>}
      </g>
    </svg>
    <div className="strawberry-position">小车 ({state.x}, {7 - state.z}) · {facing}<span>{state.holding ? '携带 1 株 · 请到边缘放下' : '夹爪空闲'}</span></div>
  </div>;
}
