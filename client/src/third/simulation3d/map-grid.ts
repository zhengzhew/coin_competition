import { THIRD_DIMENSIONS as D } from '@coin-path/shared';

/** Centimetre grid: a 9 × 9 centre inside a 6 cm perimeter on the 120 cm map. */
export function drawSimulationMapGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  depth: number,
  colors: { edge: string; major: string; minor: string },
) {
  ctx.save();
  ctx.scale(ctx.canvas.width / width, ctx.canvas.height / depth);
  ctx.fillStyle = colors.edge;
  ctx.fillRect(0, 0, width, D.edge);
  ctx.fillRect(0, depth - D.edge, width, D.edge);
  ctx.fillRect(0, D.edge, D.edge, depth - 2 * D.edge);
  ctx.fillRect(width - D.edge, D.edge, D.edge, depth - 2 * D.edge);

  // The halfway lines split each 12 cm square into four 6 cm squares.
  ctx.strokeStyle = colors.minor;
  ctx.lineWidth = .09;
  ctx.setLineDash([.8, .55]);
  ctx.beginPath();
  for (let x = D.edge + D.smallCell; x < width - D.edge; x += D.cell) {
    ctx.moveTo(x, 0); ctx.lineTo(x, depth);
  }
  for (let z = D.edge + D.smallCell; z < depth - D.edge; z += D.cell) {
    ctx.moveTo(0, z); ctx.lineTo(width, z);
  }
  ctx.stroke();

  // Start at 6 cm, not 0: ten boundary lines enclose nine full-size cells.
  ctx.strokeStyle = colors.major;
  ctx.lineWidth = .3;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let x = D.edge; x <= width - D.edge; x += D.cell) {
    ctx.moveTo(x, 0); ctx.lineTo(x, depth);
  }
  for (let z = D.edge; z <= depth - D.edge; z += D.cell) {
    ctx.moveTo(0, z); ctx.lineTo(width, z);
  }
  ctx.stroke();
  ctx.strokeRect(0, 0, width, depth);
  ctx.restore();
}
