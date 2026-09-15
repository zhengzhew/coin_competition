import { useId } from 'react';
import type { GameState, LevelDef } from '@coin-path/shared';
import { skin } from '../theme';
import './CityBoard.css';

interface Props { level: LevelDef; state: GameState; }
type Point = [number, number];
const TILE = 64;
const DEPTH = 42;
const SKEW = 17;
const THICKNESS = 20;
const MARGIN = 40;
const HEADROOM = 70;
const points = (vertices: Point[]) => vertices.map(point => point.join(',')).join(' ');
const numberLabel = (number: number) => ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][number - 1] ?? String(number);

/** Fixed oblique projection changes only drawing; all positions come from the existing rule engine. */
export default function CityBoard({ level, state }: Props) {
  const id = useId().replaceAll(':', '');
  const width = level.width * TILE + level.height * SKEW + MARGIN * 2;
  const height = level.height * DEPTH + HEADROOM + THICKNESS + 40;
  const project = (x: number, y: number, z = 0): Point => [MARGIN + x * TILE + y * SKEW, HEADROOM + (level.height - y) * DEPTH - z];
  const tile = (x: number, y: number, inset = 0): Point[] => [
    project(x + inset, y + inset), project(x + 1 - inset, y + inset),
    project(x + 1 - inset, y + 1 - inset), project(x + inset, y + 1 - inset),
  ];
  const rim = [project(-.13, -.13), project(level.width + .13, -.13), project(level.width + .13, level.height + .13), project(-.13, level.height + .13)];
  const lower = ([x,y]: Point): Point => [x,y+THICKNESS];
  const walls = new Set(level.walls.map(position => position.join(',')));
  const coins = new Map(level.coins.map(coin => [coin.position.join(','), coin]));
  const visited = new Set(state.trace.map(position => position.join(',')));
  const ground = [];
  const objects = [];
  const badges = [];

  // Paint from the far edge towards the viewer for consistent occlusion.
  for (let y = level.height - 1; y >= 0; y--) {
    const row = [];
    for (let x = 0; x < level.width; x++) {
      const key = `${x},${y}`;
      const wall = walls.has(key);
      const car = state.x === x && state.y === y;
      const start = level.start[0] === x && level.start[1] === y;
      const coin = coins.get(key);
      const collected = coin ? state.collected.includes(coin.id) : false;
      const orderIndex = coin && level.required_order ? level.required_order.indexOf(coin.id) : -1;
      const locked = orderIndex >= 0 && orderIndex !== state.collected.length;
      const center = project(x + .5, y + .5);
      const [cx, cy] = center;
      const fill = wall ? '#b6d7c7' : start ? '#e0efba' : (x+y)%2 ? '#d8eef4' : '#e8f6f8';
      row.push(<g key={key} role="gridcell" data-track-id={`board.cell.${x}.${y}`}
        data-x={x} data-y={y} data-wall={wall || undefined} data-car={car || undefined}
        aria-label={`坐标 ${x},${y}${wall ? ' 高楼障碍' : ''}${car ? ' 飞空车' : ''}${coin && !collected ? ` 能源 ${coin.id}` : ''}`}>
        <polygon className="city-tile" points={points(tile(x,y,.012))} fill={fill} />
        {start && <g className="city-landing" aria-hidden="true">
          <ellipse cx={cx} cy={cy} rx="21" ry="13" />
          <path d={`M${cx-7},${cy-6}v12m14-12v12m-14-6h14`} />
        </g>}
        {!wall && !start && !visited.has(key) && <ellipse className="city-tile-center" cx={cx} cy={cy} rx="4" ry="2.5" aria-hidden="true" />}
      </g>);

      if (wall) {
        const elevation = 27 + ((x + y) % 3) * 6;
        const x0=x+.19, x1=x+.81, y0=y+.18, y1=y+.78;
        const colors = [
          { front:'#83b6a5', side:'#629e94', roof:'#edf2d0', glass:'#e0faec' },
          { front:'#88b5cb', side:'#6799b4', roof:'#e6f6f5', glass:'#d5f6ff' },
          { front:'#b3a4c6', side:'#9484ae', roof:'#f7eef4', glass:'#ffefd4' },
        ][(x+y)%3];
        const roof = [project(x0,y0,elevation), project(x1,y0,elevation), project(x1,y1,elevation), project(x0,y1,elevation)];
        objects.push(<g key={`tower-${key}`} className="city-tower" aria-hidden="true">
          <polygon points={points([project(x0-.04,y0-.07),project(x1+.13,y0-.07),project(x1+.3,y1-.05),project(x0+.16,y1-.05)])} fill="#436f7930" />
          <polygon points={points([project(x0,y0),project(x1,y0),project(x1,y0,elevation),project(x0,y0,elevation)])} fill={colors.front} />
          <polygon points={points([project(x1,y0),project(x1,y1),project(x1,y1,elevation),project(x1,y0,elevation)])} fill={colors.side} />
          <polygon points={points(roof)} fill={colors.roof} stroke="#ffffff" strokeWidth="1.3" />
          {[8,18,28].filter(z => z < elevation-4).map(z => <g key={z} stroke={colors.glass} strokeWidth="2.8" strokeDasharray="5 5">
            <line x1={project(x0+.08,y0,z)[0]} y1={project(x0+.08,y0,z)[1]} x2={project(x1-.06,y0,z)[0]} y2={project(x1-.06,y0,z)[1]} />
            <line x1={project(x1,y0+.09,z)[0]} y1={project(x1,y0+.09,z)[1]} x2={project(x1,y1-.07,z)[0]} y2={project(x1,y1-.07,z)[1]} />
          </g>)}
          <polygon points={points([project(x0+.12,y0+.12,elevation+.6),project(x1-.12,y0+.12,elevation+.6),project(x1-.12,y1-.12,elevation+.6),project(x0+.12,y1-.12,elevation+.6)])} fill={colors.side} opacity=".38" />
        </g>);
      }
      if (coin && !collected && !car) {
        const imageSize = coin.type === 'chest' ? 45 : 40;
        objects.push(<g key={`energy-${key}`} className={`city-energy${locked ? ' is-locked' : ''}`} aria-hidden="true">
          <ellipse cx={cx} cy={cy+2} rx="12" ry="5" fill={coin.type === 'chest' ? '#bf922732' : '#318b9940'} />
          <g className="city-hovering-energy">
            <image href={coin.type === 'chest' ? skin.chest : skin.resource} x={cx-imageSize/2} y={cy-imageSize-4} width={imageSize} height={imageSize} />
          </g>
        </g>);
        if (orderIndex >= 0 || coin.type === 'chest') {
          badges.push(<g key={`badge-${key}`} transform={`translate(${cx+17} ${cy-imageSize+2})`} className={`city-badge${coin.type === 'chest' ? ' is-super' : ''}`} aria-hidden="true">
            <circle r="10" /><text dy=".34em">{orderIndex >= 0 ? numberLabel(orderIndex+1) : `×${coin.value ?? 3}`}</text>
          </g>);
        }
      }
      if (car) {
        objects.push(<g key={`vehicle-${key}`} className="city-vehicle" data-position={key} aria-hidden="true">
          <ellipse cx={cx} cy={cy+3} rx="23" ry="9" fill="#3e859734" />
          <ellipse cx={cx} cy={cy} rx="17" ry="5" fill="#6dded870" />
          <g className="city-hovering-vehicle"><image href={skin.vehicle} x={cx-35} y={cy-66} width="70" height="70" /></g>
        </g>);
      }
    }
    ground.push(<g key={y} role="row">{row}</g>);
  }

  return <div className="board-viewport city-viewport">
    <svg className="board-grid city-scene" viewBox={`0 0 ${width} ${height}`} role="grid"
      aria-label={`${level.width} 乘 ${level.height} 立体方格地图`} aria-rowcount={level.height} aria-colcount={level.width}>
      <defs>
        <linearGradient id={`${id}-edge`} x2="0" y2="1"><stop stopColor="#b7dce1" /><stop offset="1" stopColor="#79b2c0" /></linearGradient>
        <radialGradient id={`${id}-shadow`}><stop stopColor="#4b8694" stopOpacity=".24" /><stop offset="1" stopColor="#4b8694" stopOpacity="0" /></radialGradient>
      </defs>
      <g aria-hidden="true" className="city-platform">
        <ellipse cx={width/2} cy={height-50} rx={width*.46} ry="34" fill={`url(#${id}-shadow)`} />
        <polygon points={points([rim[0],rim[1],lower(rim[1]),lower(rim[0])])} fill={`url(#${id}-edge)`} />
        <polygon points={points([rim[1],rim[2],lower(rim[2]),lower(rim[1])])} fill="#79abb8" />
        <polygon points={points(rim)} fill="#f8ffff" stroke="#9cc6cc" strokeWidth="1.4" />
        <line x1={rim[0][0]+5} y1={rim[0][1]+7} x2={rim[1][0]-5} y2={rim[1][1]+7} stroke="#e4fbf8" strokeWidth="2" />
        {Array.from({length:level.width},(_,x) => <rect key={x} x={project(x+.35,-.13)[0]} y={rim[0][1]+11} width="19" height="3" rx="1.5" fill={x%3===0 ? '#f8d775' : '#d7f2ef'} />)}
      </g>
      {ground}
      <g className="city-trace" aria-hidden="true">
        {state.trace.length > 1 && <polyline points={points(state.trace.map(([x,y]) => project(x+.5,y+.5)))} />}
        {[...visited].map(key => { const [x,y]=key.split(',').map(Number); const [cx,cy]=project(x+.5,y+.5); return <ellipse key={key} cx={cx} cy={cy} rx="3.5" ry="2.3" />; })}
      </g>
      <g className="city-objects">{objects}</g>
      <g className="city-badges">{badges}</g>
      <g className="city-coordinates" aria-hidden="true">
        {Array.from({length:level.width},(_,x) => {const [cx,cy]=project(x+.5,-.13); return <text key={`x-${x}`} x={cx} y={cy+THICKNESS+17}>{x}</text>;})}
        {Array.from({length:level.height},(_,y) => {const [cx,cy]=project(-.13,y+.5); return <text key={`y-${y}`} x={cx-16} y={cy+4}>{y}</text>;})}
        <text x={width-32} y={height-6} textAnchor="end" className="city-axis">x →　y ↗</text>
      </g>
    </svg>
  </div>;
}
