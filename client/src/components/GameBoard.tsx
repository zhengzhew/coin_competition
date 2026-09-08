import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameState, LevelDef } from '@coin-path/shared';
import './GameBoard.css';

interface Props { level: LevelDef; state: GameState; }

export default function GameBoard({ level, state }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  // Reserve the frame, coordinate labels and grid gaps; fill the remaining space.
  const cellSize = Math.max(1, Math.floor(Math.min(
    (available.width - 48 - (level.width - 1)) / level.width,
    (available.height - 58 - (level.height - 1)) / level.height,
  )));
  const walls = useMemo(() => new Set(level.walls.map(([x, y]) => `${x},${y}`)), [level.walls]);
  const coins = useMemo(() => new Map(level.coins.map((coin) => [`${coin.position[0]},${coin.position[1]}`, coin])), [level.coins]);
  const trace = useMemo(() => new Set(state.trace.map(([x, y]) => `${x},${y}`)), [state.trace]);
  const rows = [];

  for (let y = level.height - 1; y >= 0; y -= 1) {
    const cells = [];
    for (let x = 0; x < level.width; x += 1) {
      const key = `${x},${y}`;
      const wall = walls.has(key);
      const car = x === state.x && y === state.y;
      const start = x === level.start[0] && y === level.start[1];
      const coin = coins.get(key);
      const coinId = coin?.id;
      const collected = coinId ? state.collected.includes(coinId) : false;
      const orderIndex = coinId && level.required_order ? level.required_order.indexOf(coinId) : -1;
      const locked = orderIndex >= 0 && orderIndex !== state.collected.length;
      const visited = trace.has(key) && !car;
      const classes = ['cell', wall ? 'wall' : '', car ? 'car' : '', start ? 'start' : '', visited ? 'trace' : ''].filter(Boolean).join(' ');
      cells.push(
        <div key={key} className={classes} style={{ width: cellSize, height: cellSize }} role="gridcell"
          aria-label={`坐标 ${x},${y}${wall ? ' 障碍' : coinId && !collected ? ` 金币 ${coinId}` : car ? ' 小车' : ''}`}
          data-track-id={`board.cell.${x}.${y}`}>
          {wall && <span className="wall-sprite" />}
          {car && <img className="car-sprite" src="/assets/car.png" alt="淘金车" />}
          {coin && !collected && !car && <><img className={`coin-sprite ${locked ? 'locked' : ''}`} src={coin.type === 'chest' ? '/assets/chest_reference.png' : '/assets/coin.png'} alt="" />{orderIndex >= 0 && <b className="coin-label">{circledNumber(orderIndex + 1)}</b>}{coin.type === 'chest' && <b className="coin-value">×{coin.value ?? 3}</b>}</>}
          {start && !car && !coinId && <span className="start-label">起点</span>}
        </div>,
      );
    }
    rows.push(<div key={y} className="board-row" role="row">{cells}</div>);
  }

  return (
    <div className="board-viewport" ref={viewportRef}>
    <div className="game-board">
      <div className="board-with-y">
        <div className="board-coords-y">
          {Array.from({ length: level.height }, (_, index) => <span key={index} style={{ height: cellSize }}>{level.height - 1 - index}</span>)}
        </div>
        <div className="board-grid" role="grid" aria-label={`${level.width} 乘 ${level.height} 方格地图`}>{rows}</div>
      </div>
      <div className="board-coords-x">
        <span className="axis-spacer" />
        {Array.from({ length: level.width }, (_, index) => <span key={index} style={{ width: cellSize }}>{index}</span>)}
      </div>
      <div className="axis-hint">x →　　y ↑</div>
    </div>
    </div>
  );
}

function circledNumber(number: number) {
  return ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][number - 1] ?? String(number);
}
