import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GameState, LevelDef } from '@coin-path/shared';
import {robotSceneBounds} from './robot-scene-bounds';
import {robotSceneTheme,cargoColor} from './robot-scene-theme';
import {buildRobotScenery} from './RobotScenery';

export type CameraView = 'orbit' | 'top' | 'follow';

/** Rendering and camera controls only. The shared engine remains the owner of movement and scores. */
export class CityScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
  private readonly controls: OrbitControls;
  private readonly resize: ResizeObserver;
  private readonly car = new THREE.Group();
  private readonly claw = new THREE.Group();
  private readonly carried = new THREE.Group();
  private readonly cargoModels = new Map<string,THREE.Group>();
  private readonly checkpointModels = new Map<string,THREE.Group>();
  private readonly dockModels = new Map<string,THREE.Group>();
  private readonly factoryCart=new THREE.Group();
  private readonly factoryLever=new THREE.Group();
  private readonly factoryCartTarget=new THREE.Vector3();
  private readonly route = new THREE.Group();
  private readonly energy = new Map<string, THREE.Group>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly resources = new Set<{ dispose(): void }>();
  private readonly cube = this.keep(new THREE.BoxGeometry(1,1,1));
  private readonly sphere = this.keep(new THREE.SphereGeometry(1,12,8));
  private readonly routeMaterial = this.keep(new THREE.LineBasicMaterial({color:'#2299ad',transparent:true,opacity:.65}));
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private readonly directionGuide = document.createElementNS('http://www.w3.org/2000/svg','svg');
  private readonly directionMarks: {group: SVGGElement; arrow: SVGPathElement; label: SVGTextElement; vector: THREE.Vector3}[] = [];
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly target = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly queue: THREE.Vector3[] = [];
  private readonly onContextLost: (event: Event) => void;
  private state: GameState;
  private view: CameraView = 'orbit';
  private traceLength = 0;
  private segmentTime = 1;
  private heading = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private disposed = false;
  private diagnosticFrame = 0;
  private fitPoints: THREE.Vector3[] = [];
  private readonly onView: (view: CameraView) => void;

  constructor(private readonly host: HTMLElement, private readonly level: LevelDef, state: GameState,
    onView: (view: CameraView) => void, onUnavailable: () => void) {
    this.state=state; this.onView=onView;
    this.renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.05;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.setClearColor('#eef7f5');
    const canvas=this.renderer.domElement;
    canvas.setAttribute('aria-label','3D 城市地图，可拖动旋转、滚轮缩放、右键平移');
    canvas.dataset.trackId='camera.scene';
    canvas.dataset.renderer='three';
    canvas.dataset.levelId=level.level_id;
    this.onContextLost=event=>{event.preventDefault(); onUnavailable();};
    canvas.addEventListener('webglcontextlost',this.onContextLost);
    host.appendChild(canvas);
    this.buildDirectionGuide();
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=!this.reducedMotion;
    this.controls.dampingFactor=.12;
    this.controls.minPolarAngle=.001;
    this.controls.maxPolarAngle=Math.PI/2-.12;
    this.controls.minDistance=2.5;
    this.controls.maxDistance=Math.max(level.width,level.height)*5;
    this.controls.maxTargetRadius=Math.max(level.width,level.height)*.8;
    this.controls.screenSpacePanning=false;
    // Do not listen to keyboard events: arrow keys and WASD belong to the game.
    this.controls.addEventListener('start',()=>{if(this.view==='top'){this.view='orbit';this.onView('orbit');}});
    this.scene.add(new THREE.HemisphereLight('#ffffff','#b8d8cc',2));
    const sunlight=new THREE.DirectionalLight('#fff7df',2);
    sunlight.position.set(-5,11,5); sunlight.castShadow=true;
    const span=Math.max(level.width,level.height)+3;
    Object.assign(sunlight.shadow.camera,{left:-span,right:span,top:span,bottom:-span,near:1,far:30});
    sunlight.shadow.mapSize.set(1024,1024); sunlight.shadow.normalBias=.04; sunlight.shadow.bias=-.0001;
    this.scene.add(sunlight);
    if(level.robot)this.buildRobotMap();else this.buildMap();
    this.buildCar();
    if(level.robot)this.buildClaw();
    this.scene.add(this.car,this.route);
    this.car.position.copy(this.world(state.x,state.y));
    this.target.copy(this.car.position); this.from.copy(this.target);
    this.update(state);
    this.resize=new ResizeObserver(()=>this.fitViewport());
    this.resize.observe(host);
    this.fitViewport();
    this.renderer.setAnimationLoop(time=>this.frame(time));
  }

  private keep<T extends {dispose():void}>(resource:T):T {this.resources.add(resource);return resource;}
  private material(color:string,emissive=false) {
    const key=color+emissive;
    if(!this.materials.has(key)) this.materials.set(key,this.keep(new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.04,emissive:emissive?color:'#000000',emissiveIntensity:emissive ? .3 : 0})));
    return this.materials.get(key)!;
  }
  private box(parent:THREE.Object3D, size:[number,number,number], position:[number,number,number], color:string, shadow=true, geometry=this.cube) {
    const mesh=new THREE.Mesh(geometry,this.material(color));
    mesh.scale.set(...size);mesh.position.set(...position);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  private world(x:number,y:number,height=.48) {return new THREE.Vector3(x-(this.level.width-1)/2,height+(this.level.robot?.cells.find(c=>c[0]===x&&c[1]===y)?.[2]??0),(this.level.height-1)/2-y);}
  private buildDirectionGuide() {
    const svg=this.directionGuide,ns=svg.namespaceURI;
    svg.classList.add('city3d-directions');svg.setAttribute('viewBox','-90 -90 180 180');
    svg.setAttribute('role','img');svg.setAttribute('aria-label','地图方向提示：箭头标明上、下、左、右指令的实际移动方向');
    if(this.level.robot) {
      svg.classList.add('robot-map-compass');svg.setAttribute('aria-label','地图指南针：北、东、南、西');
      const circle=document.createElementNS(ns,'circle');circle.setAttribute('r','86');circle.setAttribute('fill','#ffffffeb');circle.setAttribute('stroke','#b9d8db');circle.setAttribute('stroke-width','2');svg.append(circle);
    }
    for(const [id,text,x,z,color] of [
      ['up','↑ 上',0,-1,'#087b96'],['down','↓ 下',0,1,'#087b96'],
      ['left','← 左',-1,0,'#8b548f'],['right','→ 右',1,0,'#8b548f'],
    ] as const) {
      const group=document.createElementNS(ns,'g') as SVGGElement;
      group.dataset.direction=id;group.setAttribute('fill',color);
      const arrow=document.createElementNS(ns,'path') as SVGPathElement;
      const label=document.createElementNS(ns,'text') as SVGTextElement;
      label.textContent=this.level.robot?({up:'北',down:'南',left:'西',right:'东'}[id]):text;label.setAttribute('text-anchor','middle');label.setAttribute('dominant-baseline','central');
      group.append(arrow,label);svg.append(group);
      this.directionMarks.push({group,arrow,label,vector:new THREE.Vector3(x,0,z)});
    }
    this.host.append(svg);
  }
  private updateDirectionGuide() {
    if(this.level.robot) {
      const azimuth=this.controls.getAzimuthalAngle();
      for(const {group,arrow,label,vector} of this.directionMarks) {
        const dx=vector.x*Math.cos(azimuth)-vector.z*Math.sin(azimuth);
        const dy=vector.x*Math.sin(azimuth)+vector.z*Math.cos(azimuth);
        arrow.setAttribute('d',`M ${-dy*4} ${dx*4} L ${dx*42-dy*4} ${dy*42+dx*4} L ${dx*42-dy*10} ${dy*42+dx*10} L ${dx*56} ${dy*56} L ${dx*42+dy*10} ${dy*42-dx*10} L ${dx*42+dy*4} ${dy*42-dx*4} Z`);
        label.setAttribute('x',String(dx*70));label.setAttribute('y',String(dy*70));
        group.dataset.screenDirection=`${dx.toFixed(3)},${dy.toFixed(3)}`;
      }
      return;
    }
    const w=this.host.clientWidth,h=this.host.clientHeight;
    const origin=this.car.position.clone();origin.y+=.14;
    const center=origin.clone().project(this.camera);
    this.directionGuide.style.left=`${(center.x+1)*w/2}px`;
    this.directionGuide.style.top=`${(1-center.y)*h/2}px`;
    this.directionGuide.style.visibility=center.z>1||center.z< -1?'hidden':'visible';
    for(const {group,arrow,label,vector} of this.directionMarks) {
      const v=vector.clone();
      const end=origin.clone().add(v).project(this.camera);
      let dx=(end.x-center.x)*w/2,dy=-(end.y-center.y)*h/2;
      const length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
      arrow.setAttribute('d',`M ${dx*24-dy*2} ${dy*24+dx*2} L ${dx*46-dy*2} ${dy*46+dx*2} L ${dx*46-dy*6} ${dy*46+dx*6} L ${dx*56} ${dy*56} L ${dx*46+dy*6} ${dy*46-dx*6} L ${dx*46+dy*2} ${dy*46-dx*2} L ${dx*24+dy*2} ${dy*24-dx*2} Z`);
      label.setAttribute('x',String(dx*72));label.setAttribute('y',String(dy*72));
      group.dataset.screenDirection=`${dx.toFixed(3)},${dy.toFixed(3)}`;
    }
  }
  private buildRobotMap() {
    const {robot}=this.level;
    const theme=robotSceneTheme(this.level);
    this.renderer.setClearColor(theme.sky);
    this.renderer.domElement.dataset.sceneTheme=theme.id;
    const bounds=robotSceneBounds(this.level);
    const center=this.world(bounds.centerX,bounds.centerY,0);
    this.box(this.scene,[bounds.width,.2,bounds.height],[center.x,-.8,center.z],theme.trim,false);
    this.box(this.scene,[bounds.width-.06,.035,bounds.height-.06],[center.x,-.685,center.z],theme.ground,false);
    this.renderer.domElement.dataset.groundBounds=JSON.stringify(bounds);
    const road=new Set(robot!.cells.map(([x,y])=>`${x},${y}`));
    const targets=new Set([...this.level.coins.map(c=>c.position),...Object.values(robot!.deliveries)].map(p=>p.join(',')));
    // Individual raised route cells, with open space between cargo bays.
    for(const [x,y,elevation] of robot!.cells) {
      const p=this.world(x,y,0);
      this.box(this.scene,[.98,.18,.98],[p.x,p.y-.12,p.z],theme.trim);
      this.box(this.scene,[.94,.03,.94],[p.x,p.y-.015,p.z],targets.has(`${x},${y}`)?'#f9fcf1':theme.road,false);
      this.box(this.scene,[.13,elevation+.6,.13],[p.x,elevation/2-.4,p.z],theme.trim,false);
      if(!targets.has(`${x},${y}`)) {
        if(road.has(`${x-1},${y}`)&&road.has(`${x+1},${y}`))this.box(this.scene,[.24,.009,.04],[p.x,p.y+.006,p.z],'#fffdf4',false);
        else if(road.has(`${x},${y-1}`)&&road.has(`${x},${y+1}`))this.box(this.scene,[.04,.009,.24],[p.x,p.y+.006,p.z],'#fffdf4',false);
      }
    }
    for(const coin of this.level.coins) {
      if(coin.type==='checkpoint') {
        const group=new THREE.Group();group.position.copy(this.world(...coin.position,.045));
        const disc=new THREE.Mesh(this.keep(new THREE.CylinderGeometry(.4,.4,.045,28)),this.material('#c0f0f1'));group.add(disc);
        const ring=new THREE.Mesh(this.keep(new THREE.TorusGeometry(.39,.04,8,28)),this.material('#078fae',true));ring.rotation.x=Math.PI/2;ring.name='ring';ring.position.y=.03;group.add(ring);
        this.box(group,[.025,.5,.025],[0,.28,0],'#81d8df',false);
        const badge=this.targetBadge(coin.id,'checkpoint','#078fae');badge.position.y=.79;badge.name='badge';group.add(badge);
        group.userData.done=false;
        this.checkpointModels.set(coin.id,group);this.scene.add(group);continue;
      }
      const group=new THREE.Group();
      const color=cargoColor(coin.id);
      this.box(group,[.62,.48,.62],[0,.25,0],'#f2bd68');
      this.box(group,[.66,.075,.66],[0,.51,0],color);
      for(const sx of [-.24,.24])for(const sz of [-.315,.315])this.box(group,[.065,.47,.025],[sx,.25,sz],color,false);
      this.box(group,[.13,.022,.63],[0,.56,0],'#fff2ce',false);
      const tag=this.targetBadge(coin.id,'cargo',color);tag.position.y=.84;tag.name='badge';group.add(tag);
      group.position.copy(this.world(...coin.position,.04));this.cargoModels.set(coin.id,group);this.scene.add(group);
      const dest=robot!.deliveries[coin.id];
      if(dest&&!robot!.automation) {
        const dock=new THREE.Group();dock.position.copy(this.world(...dest,.035));
        this.box(dock,[.86,.055,.86],[0,0,0],'#fff6dc');
        const outline=new THREE.Group();outline.name='outline';dock.add(outline);
        for(const sx of [-1,1])for(const sz of [-1,1]) {
          this.box(outline,[.25,.035,.06],[sx*.29,.05,sz*.39],color,false);
          this.box(outline,[.06,.035,.25],[sx*.39,.05,sz*.29],color,false);
        }
        const badge=this.targetBadge(coin.id,'dock',color);badge.position.set(0,.32,0);badge.name='badge';dock.add(badge);
        dock.userData.done=false;this.dockModels.set(coin.id,dock);this.scene.add(dock);
      }
    }
    buildRobotScenery({scene:this.scene,level:this.level,theme,keep:r=>this.keep(r),material:c=>this.material(c),world:(x,y,h)=>this.world(x,y,h)});
    if(robot!.automation)this.buildFactory();
  }
  private buildFactory() {
    const machine=this.level.robot!.automation!;
    const rollers=this.keep(new THREE.CylinderGeometry(.065,.065,.72,10));
    for(const [index,[x,y]] of machine.belt.entries()) {
      const p=this.world(x,y,.13);
      this.box(this.scene,[.95,.15,.92],[p.x,p.y,p.z],'#508d99');
      for(const dz of [-.28,0,.28]) {
        const roll=new THREE.Mesh(rollers,this.material('#cadde0'));roll.rotation.z=Math.PI/2;roll.position.set(p.x,p.y+.12,p.z+dz);this.scene.add(roll);
      }
      const arrow=this.label(index<6?'›':'‹','#fff4bb','transparent',.35);arrow.position.set(p.x,p.y+.19,p.z);this.scene.add(arrow);
    }
    for(const x of [...new Set(machine.cart_path.map(p=>p[0]))]) {
      const p=this.world(x,machine.dock[1],0);
      this.box(this.scene,[.97,.08,.77],[p.x,p.y,p.z],'#93b6b6');
      for(const dz of [-.29,.29])this.box(this.scene,[1,.06,.045],[p.x,.09,p.z+dz],'#5a787e');
    }
    const load=this.world(...machine.loading,.24),dock=this.world(...machine.dock,0);
    this.box(this.scene,[.55,.07,.62],[load.x,.18,(load.z+dock.z)/2],'#f0be66');
    this.box(this.factoryCart,[.85,.15,.69],[0,.15,0],'#efb555');
    this.box(this.factoryCart,[.19,.31,.66],[.32,.35,0],'#53a5bb');
    for(const dx of [-.3,.3])for(const dz of [-.3,.3])this.box(this.factoryCart,[.17,.17,.1],[dx,.055,dz],'#556e7e');
    this.factoryCartTarget.copy(this.world(...machine.cart_path[0],.1));this.factoryCart.position.copy(this.factoryCartTarget);this.scene.add(this.factoryCart);
    const control=this.world(...machine.switch,0);
    this.box(this.scene,[.7,.26,.6],[control.x,.13,control.z],'#e6be69');
    this.factoryLever.position.set(control.x,.29,control.z);
    this.box(this.factoryLever,[.05,.44,.05],[0,.22,0],'#496d81');
    this.box(this.factoryLever,[.29,.1,.1],[0,.43,0],'#de7867');this.scene.add(this.factoryLever);
    const sign=this.targetBadge('G','cargo','#bc7950');sign.position.set(control.x,.98,control.z);this.scene.add(sign);
    for(const [id,[x,y]] of Object.entries(this.level.robot!.deliveries)) {
      const p=this.world(x,y,0);this.box(this.scene,[.95,.12,.95],[p.x,-.02,p.z],'#eadcb2');
      const label=this.label(id,cargoColor(id),'#fff8e3',.4);label.position.copy(p).y=.05;this.scene.add(label);
    }
  }
  private targetBadge(id:string,kind:'checkpoint'|'cargo'|'dock',color:string,done=false) {
    const key=`target:${id}:${kind}:${color}:${done}`;
    if(!this.textures.has(key)) {
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;
      const ctx=canvas.getContext('2d')!;
      ctx.fillStyle=done?'#289a6c':color;ctx.strokeStyle='#ffffff';ctx.lineWidth=7;
      ctx.beginPath();
      if(kind==='checkpoint') {
        ctx.moveTo(96,178);ctx.lineTo(42,104);ctx.arc(96,72,62,Math.PI*.83,Math.PI*2.17);ctx.closePath();
      } else ctx.roundRect(13,kind==='dock'?51:33,166,kind==='dock'?96:126,kind==='dock'?12:23);
      ctx.fill();ctx.stroke();
      ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='800 85px system-ui,sans-serif';ctx.fillText(kind==='checkpoint'&&!this.level.robot?.checkpoint_order?'●':id,kind==='dock'?118:96,kind==='checkpoint'?74:99);
      if(kind==='dock'){ctx.font='bold 56px system-ui,sans-serif';ctx.fillText(done?'✓':'↓',48,99);}
      if(done&&kind==='checkpoint') {
        ctx.beginPath();ctx.arc(145,36,26,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
        ctx.fillStyle='#208656';ctx.font='bold 35px system-ui,sans-serif';ctx.fillText('✓',145,36);
      }
      const texture=this.keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;this.textures.set(key,texture);
    }
    const sprite=new THREE.Sprite(this.keep(new THREE.SpriteMaterial({map:this.textures.get(key),depthWrite:false,depthTest:false,toneMapped:false})));
    sprite.renderOrder=10;
    sprite.scale.setScalar(kind==='checkpoint'?.78:kind==='dock'?.84:.63);return sprite;
  }
  private buildClaw() {
    this.claw.position.set(0,-.02,-.48);
    this.box(this.claw,[.12,.12,.38],[0,0,-.12],'#738ca4');
    for(const side of [-1,1]) {
      const finger=this.box(this.claw,[.06,.2,.28],[side*.2,-.02,-.36],'#7b6ca6');finger.name=String(side);
    }
    this.box(this.carried,[.34,.28,.34],[0,0,0],'#f2bd68');
    const band=this.box(this.carried,[.36,.055,.36],[0,.16,0],'#df812c');band.name='band';
    this.carried.position.set(0,-.02,-.86);this.carried.visible=false;
    this.car.add(this.claw,this.carried);
  }
  private label(text:string,color='#44747b',bg='transparent',size=.3) {
    const key=text+color+bg;
    if(!this.textures.has(key)) {
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const ctx=canvas.getContext('2d')!;
      if(bg!=='transparent'){ctx.fillStyle=bg;ctx.beginPath();ctx.arc(64,64,58,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle=color;ctx.font='bold 66px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,66);
      const texture=this.keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;this.textures.set(key,texture);
    }
    const material=this.keep(new THREE.SpriteMaterial({map:this.textures.get(key),depthWrite:false}));
    const sprite=new THREE.Sprite(material);sprite.scale.set(size,size,1);return sprite;
  }
  private buildMap() {
    const {width:w,height:h}=this.level;
    this.box(this.scene,[w+1.3,.06,h+1.3],[0,-.31,0],'#dbeae0',false);
    const rounded=this.keep(new RoundedBoxGeometry(1,1,1,2,.08));
    this.box(this.scene,[w+.45,.24,h+.45],[0,-.13,0],'#9cc9d0',true,rounded);
    this.box(this.scene,[w+.38,.05,h+.38],[0,.01,0],'#f9fffa',false);
    const walls=new Set(this.level.walls.map(p=>p.join(',')));
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const p=this.world(x,y,.045), wall=walls.has(`${x},${y}`), start=x===this.level.start[0]&&y===this.level.start[1];
      this.box(this.scene,[.97,.04,.97],[p.x,p.y,p.z],wall?'#afcbb7':start?'#cee3a0':(x+y)%2?'#bedee6':'#d1e9e9',false);
      if(wall)this.buildTower(p,x+y);
      if(start){const landing=this.label('H','#81a757','#f0f7cf',.6);landing.position.set(p.x,.08,p.z);this.scene.add(landing);}
    }
    for(let x=0;x<w;x++) {const p=this.world(x,0,.05);const label=this.label(String(x),'#4b7480','transparent',.26);label.position.set(p.x,.06,h/2+.37);this.scene.add(label);}
    for(let y=0;y<h;y++) {const p=this.world(0,y,.05);const label=this.label(String(y),'#4b7480','transparent',.26);label.position.set(-w/2-.38,.06,p.z);this.scene.add(label);}
    const xLabel=this.label('x+','#278ca3','transparent',.36);xLabel.position.set(w/2+.65,.1,0);this.scene.add(xLabel);
    const yLabel=this.label('y+','#688e46','transparent',.36);yLabel.position.set(0,.1,-h/2-.65);this.scene.add(yLabel);
    for(const coin of this.level.coins) {
      const group=new THREE.Group();group.position.copy(this.world(...coin.position,.43));
      const superEnergy=coin.type==='chest';
      const core=new THREE.Mesh(this.keep(superEnergy?new THREE.DodecahedronGeometry(.25):new THREE.OctahedronGeometry(.21)),this.material(superEnergy?'#efbc47':'#42b9b0',true));
      core.name='core';core.castShadow=true;group.add(core);
      const ring=new THREE.Mesh(this.keep(new THREE.TorusGeometry(superEnergy ? .31 : .26,.022,6,24)),this.material(superEnergy?'#ffe6a0':'#acf0dc',true));
      ring.rotation.x=Math.PI/2;ring.position.y=-.2;group.add(ring);
      const index=this.level.required_order?.indexOf(coin.id)??-1;
      if(index>=0 || superEnergy){const label=this.label(index>=0?String(index+1):'×3','#576d72',superEnergy?'#fff0bb':'#ffffff',.32);label.position.set(0,.42,0);group.add(label);}
      this.energy.set(coin.id,group);this.scene.add(group);
    }
    // Small perimeter greenery sits outside the playable grid.
    for(const side of [-1,1]) for(const depth of [-1,1]) {
      const x=side*(w/2+.55),z=depth*(h/2+.45);
      this.box(this.scene,[.08,.25,.08],[x,-.02,z],'#c2b898',false);
      const tree=new THREE.Mesh(this.sphere,this.material('#acd0a0'));tree.scale.set(.21,.26,.21);tree.position.set(x,.22,z);tree.castShadow=true;this.scene.add(tree);
    }
  }
  private buildTower(p:THREE.Vector3,variant:number) {
    const building=new THREE.Group();building.position.set(p.x,this.level.robot?p.y+.06:.06,p.z);building.name='building';
    const colors=['#87b5a5','#89b3c8','#b6a6c7'];const height=.55+(variant%3)*.16;
    this.box(building,[.65,height,.65],[0,height/2,0],colors[variant%3]);
    this.box(building,[.7,.055,.7],[0,height+.025,0],'#f3f1d9');
    this.box(building,[.33,.06,.36],[.03,height+.08,0],'#c7dcc3');
    for(let row=.16;row<height-.06;row+=.19) for(const col of [-.2,0,.2]) for(const face of [-1,1]) {
      this.box(building,[.09,.07,.012],[col,row,face*.331],'#e7f9ed',false);
      this.box(building,[.012,.07,.09],[face*.331,row,col],'#e7f9ed',false);
    }
    this.scene.add(building);
  }
  private buildCar() {
    const rounded=this.keep(new RoundedBoxGeometry(1,1,1,3,.16));
    this.box(this.car,[.65,.2,.86],[0,0,0],'#f8fffe',true,rounded);
    this.box(this.car,[.57,.09,.72],[0,-.12,0],'#819bbb',true,rounded);
    this.box(this.car,[.44,.19,.43],[0,.16,-.035],'#71bcd2',true,rounded);
    this.box(this.car,[.37,.035,.23],[0,.26,-.06],'#c4f3f1',false,rounded);
    for(const x of [-.24,.24])this.box(this.car,[.115,.045,.06],[x,.015,-.439],'#8feddb',false);
    for(const x of [-.37,.37]) for(const z of [-.29,.29]) {
      this.box(this.car,[.16,.11,.21],[x,-.035,z],'#b0a2d4',true,rounded);
      const fan=new THREE.Mesh(this.keep(new THREE.TorusGeometry(.095,.019,6,20)),this.material('#91e9e5',true));fan.rotation.x=Math.PI/2;fan.position.set(x,-.11,z);this.car.add(fan);
    }
  }

  update(state:GameState) {
    this.state=state;
    if(state.trace.length<this.traceLength || (state.trace.length===1 && this.traceLength!==1)) {
      this.queue.length=0;this.target.copy(this.world(state.x,state.y));this.car.position.copy(this.target);this.from.copy(this.target);this.segmentTime=1;this.heading=0;
    } else if(this.traceLength>0) {
      for(const [x,y] of state.trace.slice(this.traceLength))this.queue.push(this.world(x,y));
    }
    if(this.traceLength!==state.trace.length) this.drawRoute(state);
    this.traceLength=state.trace.length;
    if(state.robot) {
      const machine=state.robot.config.automation,live=state.robot.automation;
      if(machine&&live) {
        this.factoryCartTarget.copy(this.world(...machine.cart_path[live.tick%machine.cart_path.length],.1));
        this.factoryLever.rotation.x=state.robot.closed?-.7:0;
        this.renderer.domElement.dataset.factory=JSON.stringify(live);
      }
      this.heading={up:0,right:-Math.PI/2,down:Math.PI,left:Math.PI/2}[state.robot.facing];
      for(const side of [-1,1]) this.claw.getObjectByName(String(side))!.position.x=side*(state.robot.closed?.11:.23);
      this.carried.visible=!!state.robot.holding;
      if(this.carried.userData.holding!==state.robot.holding) {
        const previous=this.carried.getObjectByName('badge');if(previous)this.carried.remove(previous);
        if(state.robot.holding) {
          (this.carried.getObjectByName('band') as THREE.Mesh).material=this.material(cargoColor(state.robot.holding));
          const badge=this.targetBadge(state.robot.holding,'cargo',cargoColor(state.robot.holding));badge.name='badge';badge.scale.setScalar(.38);badge.position.y=.37;this.carried.add(badge);
        }
        this.carried.userData.holding=state.robot.holding;
      }
      for(const [id,group] of this.checkpointModels) {
        const done=state.collected.includes(id);
        (group.getObjectByName('ring') as THREE.Mesh).material=this.material(done?'#269a67':'#078fae',true);
        if(group.userData.done!==done) {
          const badge=group.getObjectByName('badge') as THREE.Sprite;
          const replacement=this.targetBadge(id,'checkpoint','#078fae',done);badge.material=replacement.material;
          group.userData.done=done;
        }
      }
      for(const [id,group] of this.dockModels) {
        const done=state.collected.includes(id);
        if(group.userData.done!==done) {
          const badge=group.getObjectByName('badge') as THREE.Sprite;
          const replacement=this.targetBadge(id,'dock',cargoColor(id),done);badge.material=replacement.material;badge.position.y=done?.99:.32;
          group.getObjectByName('outline')!.traverse(o=>{if(o instanceof THREE.Mesh)o.material=this.material(done?'#289a6c':cargoColor(id),true);});
          group.userData.done=done;
        }
      }
      for(const [id,object] of this.cargoModels) {
        const delivered=state.collected.includes(id);
        object.visible=!!state.robot.cargo[id] || delivered;
        object.getObjectByName('badge')!.visible=!delivered||!!machine;
        if(object.visible) {
          const onCart=machine&&live?.cart_cargo===id;
          const point=onCart?machine.cart_path[live!.tick%machine.cart_path.length]:delivered?state.robot.config.deliveries[id]:state.robot.cargo[id];
          object.position.copy(this.world(...point,onCart?.41:machine&&!delivered?.33:.04));
        }
      }
      this.renderer.domElement.dataset.robot=JSON.stringify({facing:state.robot.facing,holding:state.robot.holding,closed:state.robot.closed,delivered:state.collected});
    }
    for(const coin of this.level.robot ? [] : this.level.coins) {
      const object=this.energy.get(coin.id)!;object.visible=!state.collected.includes(coin.id);
      const index=this.level.required_order?.indexOf(coin.id)??-1;
      const locked=index>=0&&index!==state.collected.length;
      (object.getObjectByName('core') as THREE.Mesh).material=this.material(locked?'#b4c9c2':coin.type==='chest'?'#efbc47':'#42b9b0',!locked);
    }
    this.renderer.domElement.dataset.position=`${state.x},${state.y}`;
  }
  private drawRoute(state:GameState) {
    for(const object of [...this.route.children]) {
      this.route.remove(object);
      if(object instanceof THREE.Line) {object.geometry.dispose();this.resources.delete(object.geometry);}
    }
    if(state.trace.length<2)return;
    const geometry=this.keep(new THREE.BufferGeometry().setFromPoints(state.trace.map(([x,y])=>this.world(x,y,.085))));
    const line=new THREE.Line(geometry,this.routeMaterial);this.route.add(line);
  }
  private fitViewport() {
    if(this.disposed)return;
    const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    if(this.view!=='follow')this.fitCamera(this.view);
  }
  private fitCamera(view:CameraView) {
    const direction=(view==='top'?new THREE.Vector3(0,1,.001):new THREE.Vector3(.28,.88,1)).normalize();
    const center=new THREE.Vector3(0,.2,0);
    if(this.level.robot) {
      const bounds=robotSceneBounds(this.level);
      center.copy(this.world(bounds.centerX,bounds.centerY,0));center.y=.2;
    }
    this.camera.position.copy(center).add(direction);this.camera.lookAt(center);this.camera.updateMatrixWorld();
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);
    const tanV=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanH=tanV*this.camera.aspect;
    let distance=1;
    this.fitPoints=[];
    this.scene.updateMatrixWorld(true);
    this.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh || object instanceof THREE.Sprite))return;
      const bounds=new THREE.Box3().setFromObject(object);
      for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z]) {
        this.fitPoints.push(new THREE.Vector3(x,y,z));
        const p=new THREE.Vector3(x,y,z).sub(center),depth=p.dot(direction);
        distance=Math.max(distance,Math.abs(p.dot(right))/tanH+depth,Math.abs(p.dot(up))/tanV+depth);
      }
    });
    if(this.level.robot) {
      distance=1;this.fitPoints=[];
      const machine=this.level.robot.automation;
      const points=[...this.level.robot.cells,...(machine?[...machine.belt,...machine.cart_path,machine.switch,...Object.values(this.level.robot.deliveries)]:[])];
      for(const [x,y] of points) for(const dx of [-.7,.7]) for(const dz of [-.7,.7]) for(const height of [0,1.5]) {
        const point=this.world(x,y,height).add(new THREE.Vector3(dx,0,dz));this.fitPoints.push(point);
        const p=point.clone().sub(center),depth=p.dot(direction);
        distance=Math.max(distance,Math.abs(p.dot(right))/tanH+depth,Math.abs(p.dot(up))/tanV+depth);
      }
    }
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance*1.04);this.controls.update();
  }
  setView(view:CameraView) {
    // Clear drag inertia before setting a precise preset camera direction.
    const damping=this.controls.enableDamping;
    this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
    this.view=view;this.onView(view);this.controls.enablePan=view!=='follow';
    if(view==='follow') {
      this.controls.target.copy(this.car.position);this.controls.target.y=.2;
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(2.8,3.6,3.8));
      this.controls.update();
    } else this.fitCamera(view);
  }
  zoom(factor:number) {
    const offset=this.camera.position.clone().sub(this.controls.target);
    const distance=THREE.MathUtils.clamp(offset.length()*factor,this.controls.minDistance,this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));this.controls.update();
  }
  private frame(time:number) {
    if(this.disposed)return;
    const delta=Math.min(.05,Math.max(0,(time-this.lastFrame)/1000));this.lastFrame=time;this.elapsed+=delta;
    if(this.state.robot?.automation) {
      this.factoryCart.position.lerp(this.factoryCartTarget,this.reducedMotion?1:Math.min(1,delta*12));
      const id=this.state.robot.automation.cart_cargo;
      if(id) {const cargo=this.cargoModels.get(id);if(cargo){cargo.position.copy(this.factoryCart.position);cargo.position.y+=.31;}}
    }
    if(this.segmentTime>=1 && this.queue.length) {
      this.from.copy(this.target);this.target.copy(this.queue.shift()!);this.segmentTime=0;
      const dx=this.target.x-this.from.x,dz=this.target.z-this.from.z;
      if(!this.state.robot && (dx||dz))this.heading=Math.atan2(-dx,-dz);
    }
    this.segmentTime=Math.min(1,this.segmentTime+delta/.085);
    this.car.position.lerpVectors(this.from,this.target,this.segmentTime);
    this.car.position.y+=this.reducedMotion?0:Math.sin(this.elapsed*3)*.025;
    const angle=Math.atan2(Math.sin(this.heading-this.car.rotation.y),Math.cos(this.heading-this.car.rotation.y));
    this.car.rotation.y+=angle*(this.reducedMotion?1:Math.min(1,delta*18));
    for(const [id,object] of this.energy) {
      if(!object.visible)continue;
      object.position.y=.43+(this.reducedMotion?0:Math.sin(this.elapsed*2.5+id.charCodeAt(0))*.045);
      if(!this.reducedMotion)object.getObjectByName('core')!.rotation.y+=delta*.55;
    }
    if(this.view==='follow') {
      const followTarget=this.car.position.clone();followTarget.y-=.28;
      const smooth=this.reducedMotion?1:1-Math.exp(-delta*7);
      // Translate camera and orbit center together, preserving the user's angle and zoom.
      const shift=followTarget.sub(this.controls.target).multiplyScalar(smooth);
      this.controls.target.add(shift);this.camera.position.add(shift);
    }
    this.controls.update();
    this.renderer.render(this.scene,this.camera);
    this.updateDirectionGuide();
    if(++this.diagnosticFrame%5===0) {
      const canvas=this.renderer.domElement;
      canvas.dataset.view=this.view;canvas.dataset.camera=this.camera.position.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.target=this.controls.target.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.vehicle=this.car.position.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.buildings=String(this.level.walls.length);canvas.dataset.targets=String(this.level.robot?this.level.coins.length-this.state.collected.length:[...this.energy.values()].filter(o=>o.visible).length);
      canvas.dataset.checkpoints=JSON.stringify([...this.checkpointModels].map(([id,g])=>({id,label:this.level.robot?.checkpoint_order?id:'●',done:g.userData.done})));
      canvas.dataset.deliveries=JSON.stringify([...this.dockModels].map(([id,g])=>({id,done:g.userData.done})));
      canvas.dataset.ready='true';
      const projected=this.fitPoints.map(p=>p.clone().project(this.camera));
      canvas.dataset.bounds=JSON.stringify([
        Math.min(...projected.map(p=>p.x)),Math.min(...projected.map(p=>p.y)),
        Math.max(...projected.map(p=>p.x)),Math.max(...projected.map(p=>p.y)),
      ].map(n=>Number(n.toFixed(3))));
    }
  }
  dispose() {
    this.disposed=true;this.renderer.setAnimationLoop(null);this.resize.disconnect();this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);
    for(const resource of this.resources)resource.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();this.directionGuide.remove();
  }
}
