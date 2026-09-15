import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GameState, LevelDef } from '@coin-path/shared';

export type CameraView = 'orbit' | 'top' | 'follow';

/** Rendering and camera controls only. The shared engine remains the owner of movement and scores. */
export class CityScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
  private readonly controls: OrbitControls;
  private readonly resize: ResizeObserver;
  private readonly car = new THREE.Group();
  private readonly route = new THREE.Group();
  private readonly energy = new Map<string, THREE.Group>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly resources = new Set<{ dispose(): void }>();
  private readonly cube = this.keep(new THREE.BoxGeometry(1,1,1));
  private readonly sphere = this.keep(new THREE.SphereGeometry(1,12,8));
  private readonly routeMaterial = this.keep(new THREE.LineBasicMaterial({color:'#2299ad',transparent:true,opacity:.65}));
  private readonly textures = new Map<string, THREE.CanvasTexture>();
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
    this.buildMap(); this.buildCar();
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
  private world(x:number,y:number,height=.48) {return new THREE.Vector3(x-(this.level.width-1)/2,height,(this.level.height-1)/2-y);}
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
    const building=new THREE.Group();building.position.set(p.x,.06,p.z);building.name='building';
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
    for(const coin of this.level.coins) {
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
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance*1.04);this.controls.update();
  }
  setView(view:CameraView) {
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
    if(this.segmentTime>=1 && this.queue.length) {
      this.from.copy(this.target);this.target.copy(this.queue.shift()!);this.segmentTime=0;
      const dx=this.target.x-this.from.x,dz=this.target.z-this.from.z;
      if(dx||dz)this.heading=Math.atan2(-dx,-dz);
    }
    this.segmentTime=Math.min(1,this.segmentTime+delta/.085);
    this.car.position.lerpVectors(this.from,this.target,this.segmentTime);
    this.car.position.y=.48+(this.reducedMotion?0:Math.sin(this.elapsed*3)*.025);
    const angle=Math.atan2(Math.sin(this.heading-this.car.rotation.y),Math.cos(this.heading-this.car.rotation.y));
    this.car.rotation.y+=angle*(this.reducedMotion?1:Math.min(1,delta*18));
    for(const [id,object] of this.energy) {
      if(!object.visible)continue;
      object.position.y=.43+(this.reducedMotion?0:Math.sin(this.elapsed*2.5+id.charCodeAt(0))*.045);
      if(!this.reducedMotion)object.getObjectByName('core')!.rotation.y+=delta*.55;
    }
    if(this.view==='follow') {
      const followTarget=this.car.position.clone();followTarget.y=.2;
      const smooth=this.reducedMotion?1:1-Math.exp(-delta*7);
      // Translate camera and orbit center together, preserving the user's angle and zoom.
      const shift=followTarget.sub(this.controls.target).multiplyScalar(smooth);
      this.controls.target.add(shift);this.camera.position.add(shift);
    }
    this.controls.update();
    this.renderer.render(this.scene,this.camera);
    if(++this.diagnosticFrame%5===0) {
      const canvas=this.renderer.domElement;
      canvas.dataset.view=this.view;canvas.dataset.camera=this.camera.position.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.target=this.controls.target.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.vehicle=this.car.position.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.buildings=String(this.level.walls.length);canvas.dataset.targets=String([...this.energy.values()].filter(o=>o.visible).length);
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
    this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
