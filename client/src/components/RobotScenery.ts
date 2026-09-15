import * as THREE from 'three';
import type {LevelDef} from '@coin-path/shared';
import type {RobotSceneTheme,SceneryKind} from './robot-scene-theme';
import {robotSceneBounds} from './robot-scene-bounds';

interface SceneryKit {
  scene:THREE.Scene; level:LevelDef; theme:RobotSceneTheme;
  keep<T extends {dispose():void}>(resource:T):T;
  material(color:string):THREE.Material;
  world(x:number,y:number,height:number):THREE.Vector3;
}

/** Decorative objects occupy existing obstacles or holes, never a driveable tile. */
export function buildRobotScenery(kit:SceneryKit) {
  const {scene,level,theme,keep,material,world}=kit;
  const cube=keep(new THREE.BoxGeometry(1,1,1));
  const sphere=keep(new THREE.SphereGeometry(1,10,8));
  const cylinder=keep(new THREE.CylinderGeometry(1,1,1,16));
  const cone=keep(new THREE.ConeGeometry(1,1,6));
  const box=(g:THREE.Object3D,s:number[],p:number[],color:string,geo:THREE.BufferGeometry=cube)=>{
    const m=new THREE.Mesh(geo,material(color));m.scale.set(s[0],s[1],s[2]);m.position.set(p[0],p[1],p[2]);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
  };
  const ball=(g:THREE.Object3D,s:number[],p:number[],color:string)=>box(g,s,p,color,sphere);
  const post=(g:THREE.Object3D,r:number,h:number,p:number[],color:string)=>box(g,[r,h,r],p,color,cylinder);
  const window=(g:THREE.Object3D,x:number,y:number,z:number)=>box(g,[.13,.15,.015],[x,y,z],'#f4fcff');
  const make=(kind:SceneryKind,x:number,y:number,obstacle=false)=>{
    const g=new THREE.Group();g.name=`scenery-${kind}`;g.userData.scenery=true;
    g.position.copy(world(x,y,kind==='boat'&&!obstacle?-.69:-.025));scene.add(g);
    if(!obstacle&&kind!=='boat')box(g,[.85,.64,.85],[0,-.34,0],theme.ground);
    if(kind==='tree'||kind==='flowers'||kind==='bench') {
      box(g,[.78,.06,.78],[0,.03,0],'#8fbd70');
      if(kind==='tree') {
        post(g,.065,.5,[0,.27,0],'#b28761');
        ball(g,[.3,.34,.3],[0,.63,0],'#51a87c');ball(g,[.2,.24,.2],[-.18,.48,.05],'#83c36c');
        for(const sx of [-.22,.24])ball(g,[.07,.07,.07],[sx,.13,.26],'#ffe393');
      } else if(kind==='bench') {
        for(const sx of [-.26,.26])box(g,[.06,.3,.42],[sx,.18,0],'#62858c');
        box(g,[.72,.07,.42],[0,.36,0],'#dba66f');box(g,[.72,.3,.07],[0,.48,.19],'#ecc28a');
      } else for(let i=0;i<7;i++) {
        const sx=Math.sin(i*2.4)*.27,sz=Math.cos(i*2.4)*.27;
        post(g,.016,.17,[sx,.14,sz],'#53a674');ball(g,[.065,.045,.065],[sx,.24,sz],['#f58da9','#ffe18d','#c19cdd'][i%3]);
      }
    } else if(kind==='fountain') {
      post(g,.47,.13,[0,.065,0],'#e7f0d1');post(g,.4,.03,[0,.15,0],'#4bc6d5');
      post(g,.075,.55,[0,.38,0],'#a8eceb');post(g,.25,.065,[0,.54,0],'#edf8d6');
      ball(g,[.08,.15,.08],[0,.75,0],'#a8eceb');
      for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])ball(g,[.045,.1,.045],[Math.cos(a)*.18,.34,Math.sin(a)*.18],'#c1f6f0');
    } else if(kind==='school') {
      box(g,[.78,.9,.7],[0,.45,0],'#f4cc75');box(g,[.84,.12,.78],[0,.96,0],'#e78273');
      box(g,[.2,.32,.025],[0,.16,.36],'#70b6bb');
      for(const sx of [-.24,.24])for(const sy of [.3,.62])window(g,sx,sy,.36);
      box(g,[.31,.27,.73],[0,1.05,0],'#fae8b4');
      const clock=post(g,.1,.02,[0,1.09,.38],'#ffffff');clock.rotation.x=Math.PI/2;
      box(g,[.015,.055,.018],[0,1.105,.4],'#4d6f7b');box(g,[.045,.015,.018],[.017,1.08,.4],'#4d6f7b');
      box(g,[.012,.36,.012],[.27,1.16,0],'#7b9199');box(g,[.18,.1,.018],[.35,1.27,0],'#67bfd0');
    } else if(kind==='court') {
      box(g,[.86,.04,.86],[0,.02,0],'#eaa97e');
      for(const sx of [-.36,.36])box(g,[.015,.008,.72],[sx,.046,0],'#fff4dc');
      for(const sz of [-.36,0,.36])box(g,[.73,.008,.015],[0,.046,sz],'#fff4dc');
      post(g,.11,.009,[0,.048,0],'#f7d6a2');
      box(g,[.035,.66,.035],[0,.33,-.3],'#728f9e');box(g,[.28,.19,.04],[0,.66,-.3],'#fcffff');
      ball(g,[.065,.065,.065],[.19,.1,.1],'#ed965e');
    } else if(kind==='tower'||kind==='shop'||kind==='hangar'||kind==='containers') {
      if(kind==='containers') {
        for(let i=0;i<3;i++) {
          const sx=i===2?0:(i-.5)*.37,sy=i===2?.54:.18;
          const color=['#61afba','#eaa57b','#a69bcf'][i];box(g,[.34,.34,.72],[sx,sy,0],color);
          for(const z of [-.23,-.07,.09,.25])box(g,[.35,.024,.018],[sx,sy+.17,z],'#f4ead8');
        }
      } else {
        const h=kind==='tower'?1.18:kind==='hangar'?.62:.5;
        box(g,[.7,h,.7],[0,h/2,0],kind==='tower'?'#81b6cc':kind==='hangar'?'#bbc3e2':'#f4d19b');
        box(g,[.8,.08,.8],[0,h+.04,0],kind==='shop'?'#ef978b':'#e3edf8');
        if(kind==='tower') {
          box(g,[.36,.23,.4],[.04,h+.14,0],'#aad2df');post(g,.018,.22,[.04,h+.34,0],'#c6dfe9');
          for(const sy of [.22,.5,.78,1.06])for(const sx of [-.21,.04,.25])for(const face of [-1,1])window(g,sx,sy,face*.356);
        } else if(kind==='hangar') {
          box(g,[.52,.44,.03],[0,.22,.36],'#6279a6');
          for(const sx of [-.18,0,.18])box(g,[.025,.43,.035],[sx,.22,.38],'#bce8ed');
          box(g,[.1,.06,.3],[0,h+.11,0],'#f8da86');
        } else {
          for(const sx of [-.26,-.13,0,.13,.26])box(g,[.13,.06,.3],[sx,.42,.42],Math.round(sx*100)%2?'#fdf6e0':'#e4887b');
          for(const sx of [-.2,.2])window(g,sx,.22,.36);
        }
      }
    } else if(kind==='boat') {
      const hull=box(g,[.35,.15,.85],[0,.18,0],'#fff4dc');hull.rotation.y=.25;
      box(g,[.33,.12,.49],[0,.28,.06],'#ee9c73');box(g,[.22,.2,.26],[0,.44,.09],'#e7f9fa');
      box(g,[.23,.1,.02],[0,.47,.23],'#60abc9');post(g,.012,.24,[0,.64,.05],'#809bac');
      for(const sx of [-.29,.29])box(g,[.025,.01,.7],[sx,.08,0],'#b8f3ec');
    } else if(kind==='crane') {
      box(g,[.7,.12,.62],[0,.06,0],'#e7b768');
      for(const sx of [-.22,.22])box(g,[.07,.96,.09],[sx,.6,0],'#ecc673');
      box(g,[.72,.09,.14],[0,1.08,0],'#e6b354');
      box(g,[.015,.4,.015],[.26,.84,0],'#7199a2');box(g,[.16,.035,.12],[.21,.64,0],'#658692');
      for(const sy of [.3,.56,.82])box(g,[.48,.045,.07],[0,sy,0],'#f4d499');
    } else if(kind==='solar') {
      box(g,[.78,.08,.78],[0,.04,0],'#9fbd83');
      for(const sx of [-.26,.26])box(g,[.045,.4,.045],[sx,.25,0],'#dbe6d4');
      const panel=new THREE.Group();panel.position.y=.48;panel.rotation.x=-.22;g.add(panel);
      box(panel,[.76,.04,.62],[0,0,0],'#597dae');
      for(const sx of [-.24,0,.24])box(panel,[.014,.006,.6],[sx,.023,0],'#b6d8e9');
      for(const sz of [-.15,.15])box(panel,[.74,.006,.012],[0,.023,sz],'#b6d8e9');
    } else if(kind==='turbine') {
      post(g,.23,.09,[0,.045,0],'#a5c893');post(g,.045,.9,[0,.49,0],'#edf5e1');
      const rotor=new THREE.Group();rotor.position.set(0,1,.05);g.add(rotor);
      for(let i=0;i<3;i++){const blade=box(rotor,[.07,.35,.025],[Math.sin(i*2.094)*.16,Math.cos(i*2.094)*.16,0],'#f5f8ea');blade.rotation.z=-i*2.094;}
      ball(rotor,[.065,.065,.065],[0,0,.025],'#8dc8b4');
    } else if(kind==='greenhouse') {
      box(g,[.8,.1,.76],[0,.05,0],'#c6d699');box(g,[.67,.48,.65],[0,.32,0],'#acd5b0');
      const roof=box(g,[.48,.36,.5],[0,.7,0],'#dbeccb',cone);roof.rotation.y=Math.PI/4;
      for(const sx of [-.25,0,.25])box(g,[.025,.49,.68],[sx,.34,0],'#f5f3d9');
      box(g,[.7,.025,.67],[0,.49,0],'#f5f3d9');
    } else if(kind==='radar') {
      post(g,.26,.12,[0,.06,0],'#b8c1e1');post(g,.06,.52,[0,.38,0],'#e4e9f7');
      const dish=ball(g,[.32,.08,.32],[0,.7,0],'#f8f8ff');dish.rotation.x=-.5;
      post(g,.014,.23,[0,.8,.06],'#a295c8');ball(g,[.04,.04,.04],[0,.92,.06],'#97dfe1');
    } else if(kind==='shuttle') {
      box(g,[.32,.17,.79],[0,.28,0],'#faf8ff');box(g,[.79,.06,.28],[0,.25,.12],'#9caedf');
      ball(g,[.14,.11,.2],[0,.42,-.09],'#7bc4d6');box(g,[.045,.22,.2],[0,.4,.3],'#af9ad5');
      for(const sx of [-.28,.28])box(g,[.08,.09,.2],[sx,.26,.17],'#f3ca8f');
    }
    return g;
  };
  level.walls.forEach(([x,y],i)=>make(theme.wall[i%theme.wall.length],x,y,true));
  const occupied=new Set([...level.robot!.cells,...level.walls,...level.coins.map(c=>c.position),level.start,...Object.values(level.robot!.deliveries)].map(p=>`${p[0]},${p[1]}`));
  const bounds=robotSceneBounds(level);
  for(const [kind,x,y] of theme.props)if(!occupied.has(`${x},${y}`)&&x>=bounds.minX&&x<=bounds.maxX&&y>=bounds.minY&&y<=bounds.maxY)make(kind,x,y);
}
