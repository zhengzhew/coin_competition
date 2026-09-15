import type {LevelDef} from '@coin-path/shared';

export type SceneryKind='tree'|'flowers'|'bench'|'fountain'|'school'|'court'|'tower'|'shop'|'crane'|'containers'|'boat'|'solar'|'turbine'|'greenhouse'|'hangar'|'radar'|'shuttle';
export interface RobotSceneTheme {
  id:string; name:string; ground:string; road:string; trim:string; sky:string;
  wall:SceneryKind[];
  props:[SceneryKind,number,number][];
}
const themes:RobotSceneTheme[]=[
  {id:'park',name:'星光公园',ground:'#9bc98d',road:'#f4e2b8',trim:'#7aa577',sky:'#edf8ef',wall:['tree'],
    props:[['fountain',3,3],['tree',2,2],['tree',4,4],['bench',2,4],['flowers',4,2],['flowers',3,4]]},
  {id:'school',name:'未来校园',ground:'#d8e7b4',road:'#f1dfc3',trim:'#d0b392',sky:'#f6f9ee',wall:['school'],
    props:[['school',2,4],['court',4,4],['school',4,2],['tree',2,2]]},
  {id:'city',name:'阳光街区',ground:'#c2d7df',road:'#dfeaf0',trim:'#889faf',sky:'#eff7fc',wall:['tower','shop'],
    props:[['tower',3,3],['tower',5,2],['shop',1,6],['tree',3,7],['shop',7,3],['flowers',0,1]]},
  {id:'harbor',name:'滨海港湾',ground:'#80cbdc',road:'#f6deb1',trim:'#cba96c',sky:'#edf8ff',wall:['containers','crane'],
    props:[['boat',1,2],['boat',4,6],['crane',7,2],['containers',3,4],['boat',7,6],['containers',1,7]]},
  {id:'energy',name:'生态能源站',ground:'#b8d6a4',road:'#e8ecd4',trim:'#8dac92',sky:'#f0f8ea',wall:['solar','turbine','greenhouse'],props:[]},
  {id:'airport',name:'云端空港',ground:'#c4cbe7',road:'#e8eafb',trim:'#939fc2',sky:'#f2f3ff',wall:['hangar','radar','hangar'],
    props:[['shuttle',1,4],['radar',0,3],['shuttle',8,0],['solar',11,4],['hangar',10,3]]},
  {id:'factory',name:'自动化物流中心',ground:'#c3e1dc',road:'#e5f0e8',trim:'#80aaa6',sky:'#edf8f7',wall:['containers','crane'],
    props:[['crane',9,7],['containers',10,7],['solar',9,2],['tree',3,2]]},
];
export function robotSceneTheme(level:LevelDef):RobotSceneTheme {
  const index=Number(level.content_id?.match(/^future_916_(\d+)$/)?.[1]??0)-1;
  return themes[index]??themes[2];
}
export function cargoColor(id:string) {return ['#df812c','#8661cf','#d95181','#337cb2'][((id.charCodeAt(0)-65)%4+4)%4];}
