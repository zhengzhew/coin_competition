import type {LevelDef} from '@coin-path/shared';

/** Visual bounds only: the map's coordinate range and movement cells stay intact. */
export function robotSceneBounds(level:LevelDef) {
  const machine=level.robot?.automation;
  const points=[level.start,...(level.robot?.cells??[]),...level.walls,...level.coins.map(c=>c.position),...Object.values(level.robot?.deliveries??{}),...(machine?[...machine.belt,...machine.cart_path,machine.switch]:[])];
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  // Half a cell for the platform itself, plus a narrow quarter-cell border.
  const padding=.75;
  return {minX,minY,maxX,maxY,centerX:(minX+maxX)/2,centerY:(minY+maxY)/2,
    left:minX-padding,bottom:minY-padding,width:maxX-minX+padding*2,height:maxY-minY+padding*2};
}
