import type {CoinDef,LevelDef} from './types.js';
import {curriculumMapData} from './curriculum-map-data.js';
const checkpoints=(points:[string,number,number][]):CoinDef[]=>points.map(([id,x,y])=>({id,position:[x,y],type:'checkpoint',value:1}));
const cells=(points:[number,number][]):[number,number,number][]=>[...new Map(points.map(p=>[p.join(','),[...p,0] as [number,number,number]])).values()];

export function buildCurriculumLevels(base:LevelDef):LevelDef[] {
  const square:[number,number][]=[];
  for(let n=1;n<=5;n++)square.push([1,n],[5,n],[n,1],[n,5]);
  const cross:[number,number][]=[];
  for(let n=0;n<=6;n++)cross.push([3,n],[n,3]);
  for(let n=1;n<=5;n++)cross.push([1,n],[5,n],[n,1],[n,5]);
  const fishWalls:[number,number][]=[[10,4],[1,3],[3,3],[5,3],[6,3],[7,3],[9,3],[10,3],[9,2],[10,2],[11,2],[2,1],[3,1],[5,1],[7,1],[9,1],[10,1],[10,0]];
  const fishCells=cells(Array.from({length:72},(_,i)=>[i%12,Math.floor(i/12)] as [number,number]));
  const ringDelivery=structuredClone(curriculumMapData['3']);
  const ringCargoA=ringDelivery.coins.find(coin=>coin.id==='A')!;
  [ringCargoA.position,ringDelivery.robot!.deliveries.A]=[ringDelivery.robot!.deliveries.A,ringCargoA.position];
  const fishDelivery=structuredClone(curriculumMapData['5']);
  // Swap matching cargo and docks while keeping the supplied route and patrol points.
  for(const cargo of fishDelivery.coins.filter(coin=>coin.type!=='checkpoint')) {
    const dock=fishDelivery.robot!.deliveries[cargo.id];
    fishDelivery.robot!.deliveries[cargo.id]=cargo.position;
    cargo.position=dock;
  }
  const levels:LevelDef[]=[
    {...base,width:7,height:7,start:[1,1],coins:checkpoints([['A',1,5],['B',5,5],['C',5,1],['H',1,1]]),walls:[],robot:{facing:'up',cells:cells(square),deliveries:{}}},
    {...base,width:7,height:7,start:[3,3],coins:checkpoints([['A',3,6],['B',6,3],['C',3,0],['D',0,3],['H',3,3]]),walls:[],robot:{facing:'up',cells:cells(cross),deliveries:{},checkpoint_order:['A','B','C','D','H']}},
    structuredClone(curriculumMapData['2']),
    ringDelivery,
    {...base,width:12,height:6,start:[0,2],walls:fishWalls,coins:checkpoints([['A',0,4],['B',0,0],['C',4,2],['D',4,4],['E',4,0],['F',8,2],['G',8,0],['H',8,4]]),robot:{facing:'right',cells:fishCells,deliveries:{}}},
    fishDelivery,
  ];
  const titles=['方形巡航','进退有序','城市巡逻','环线配送','鱼骨巡检','鱼骨配送'];
  const objectives=['完成全部 4 处打卡。','依次前进打卡 A—D，每次倒退回中心，最后回到 H。','打卡全部 6 个巡逻点。','送达 3 箱货物，并完成 3 处打卡。','沿鱼骨路线完成全部 8 处打卡。','送达 3 箱货物，并完成 3 处打卡。'];
  const hints=['每段路重复“前进、右转”。','车头不掉转，倒退回中心再转向。','支路打卡后倒退，继续沿环线巡逻。','货物送到同字母泊位；经过圆环即可打卡。','支路上前进与后退，主路上继续前进。','先夹取货物，再检查支路并送到对应泊位。'];
  return levels.map((level,i)=>({...level,
    level_id:`FL${31+i}`,keyboard_id:`FK${31+i}`,python_id:`FP${31+i}`,content_id:`future_916_${i+1}`,content_version:'future-loop-3.0.0',
    title:titles[i],stage:i<2?'explore':i<4?'guided':'challenge',category:i<2?'intro':i<4?'ordered':'optimal_free',category_label:i<2?'循环基础':i<4?'城市任务':'鱼骨挑战',
    objective:objectives[i],rule_hint:hints[i],knowledge:objectives[i],initial_facing:level.robot!.facing,
    optimal_actions:[19,27,26,25,35,28][i],optimal_code_lines:[3,4,4,7,7,8][i],expected_optimal_steps:undefined,show_optimal_feedback:false,
    required_order:null,step_limit:null,max_commands:256,max_attempts:3,
    python:{...base.python},
  }));
}
