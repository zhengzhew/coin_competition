import type { LevelDef } from './types.js';
import { buildCurriculumLevels } from './curriculum-levels.js';

/** New assignment IDs preserve the previous future-city attempts and replay rules. */
export function legacyRobotLevels(): LevelDef[] {
  return Array.from({length:6},(_,index)=>{
    const count=index+1, width=count*3+2;
    const cells:[number,number,number][]=[];
    for(let x=0;x<width;x++) {
      const elevation=index<2?0:Math.min(x, width-1-x)*.12;
      cells.push([x,4,elevation]);
      if(x%3===1) cells.push([x,3,elevation],[x,5,elevation]);
    }
    const coins=Array.from({length:count},(_,i)=>({id:String.fromCharCode(65+i),position:[1+3*i,5] as [number,number],value:1}));
    const id=String(21+index);
    return {
      level_id:`FL${id}`,keyboard_id:`FK${id}`,python_id:`FP${id}`,
      content_id:`future_loop_${index+1}`,content_version:'future-loop-2.0.0',
      title:['夹爪初体验','空港双站','循环配送','云桥接力','高架物流','城市调度员'][index],
      stage:index<2?'explore':index<4?'guided':'challenge',category:index<2?'intro':index<4?'ordered':'optimal_free',
      category_label:index<2?'驾驶与夹爪':index<4?'循环接力':'城市调度',
      width,height:9,start:[1,4],coins,walls:[],required_order:null,step_limit:null,max_commands:256,max_attempts:3,
      expected_optimal_steps:3*index,show_optimal_feedback:false,
      optimal_code_lines:index===0?4:8,
      robot:{facing:'up',cells,deliveries:Object.fromEntries(coins.map(c=>[c.id,[c.position[0],3]]))},
      python:{robot:true,template_id:'repeat_slots_v2',initial_rows:0,min_rows:1,max_rows:40,can_add_delete_rows:true,count_range:[1,20],allowed_functions:['forward','backward','turn_left','turn_right','grab','release']},
      objective:`把 ${count} 箱货物送到同字母泊位。`,
      rule_hint:'车头前一格夹取或松开；A / D 原地转 90°。',
      knowledge:index<2?'前进、后退与转向；练习夹取和松开。':'把重复的搬运步骤放进循环。',
    };
  });
}

export function robotLevels():LevelDef[] {return buildCurriculumLevels(legacyRobotLevels()[0]);}
