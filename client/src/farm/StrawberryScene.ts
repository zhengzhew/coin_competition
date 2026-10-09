import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ThirdSnapshot } from '@coin-path/shared';
import type { CameraView } from '../components/ThreeCityScene';
import type { SaikaoRobot } from '../components/SaikaoRobot';

/** Three.js presentation of the discrete farm. The grid engine owns movement, picking and scoring. */
export class StrawberryScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, .1, 120);
  private readonly controls: OrbitControls;
  private readonly resize: ResizeObserver;
  private readonly resources = new Set<{ dispose(): void }>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly cube = this.keep(new THREE.BoxGeometry(1, 1, 1));
  private readonly round = this.keep(new RoundedBoxGeometry(1, 1, 1, 3, .12));
  private readonly sphere = this.keep(new THREE.SphereGeometry(1, 14, 10));
  private readonly berryShape = this.keep(new THREE.LatheGeometry([
    [.015, .1], [.12, .18], [.23, .34], [.29, .49], [.26, .61], [.14, .66], [0, .65],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 20));
  private readonly robot = new THREE.Group();
  private readonly carried = new THREE.Group();
  private readonly berries = new Map<string, THREE.Group>();
  private readonly destination = new THREE.Vector3();
  private readonly compass = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly compassNeedle = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly lost: (event: Event) => void;
  private readonly fitPoints: THREE.Vector3[] = [];
  private state: ThirdSnapshot;
  private view: CameraView = 'orbit';
  private disposed = false;
  private lastFrame = 0;
  private diagnostics = 0;

  constructor(private readonly host: HTMLElement, state: ThirdSnapshot,
    private readonly onView: (view: CameraView) => void, onUnavailable: () => void, private readonly model: SaikaoRobot) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setClearColor('#eef3e6');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', '3D 草莓棋盘，可拖动旋转、滚轮缩放、右键平移');
    canvas.dataset.farmScene = 'strawberry'; canvas.dataset.renderer = 'three'; canvas.dataset.gridSize = '8,8';
    this.lost = event => { event.preventDefault(); if (!this.disposed) onUnavailable(); };
    canvas.addEventListener('webglcontextlost', this.lost);
    host.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !this.reducedMotion; this.controls.dampingFactor = .12;
    this.controls.minPolarAngle = .001; this.controls.maxPolarAngle = Math.PI / 2 - .12;
    this.controls.minDistance = 3; this.controls.maxDistance = 45; this.controls.maxTargetRadius = 6;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => {
      if (this.view === 'top') { this.view = 'orbit'; this.onView(this.view); }
    });
    this.scene.add(new THREE.HemisphereLight('#fffef4', '#96ad88', 1.8));
    const sunlight = new THREE.DirectionalLight('#fff4dc', 2);
    sunlight.position.set(-5, 12, 6); sunlight.castShadow = true;
    Object.assign(sunlight.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sunlight.shadow.mapSize.set(1024, 1024); sunlight.shadow.normalBias = .025; sunlight.shadow.bias = -.0001;
    this.scene.add(sunlight);
    this.buildBoard(); this.buildRobot(); this.buildCompass();
    for (const obj of state.objects) { const berry = this.buildBerry(); this.berries.set(obj.id, berry); this.scene.add(berry); }
    this.carried.add(this.buildBerry()); this.carried.scale.setScalar(.48); this.carried.position.set(0, .02, -.5); this.robot.add(this.carried);
    this.update(state, true);
    for (const x of [-4.7, 4.5]) for (const y of [-.35, .9]) for (const z of [-4.5, 4.7]) this.fitPoints.push(new THREE.Vector3(x, y, z));
    this.resize = new ResizeObserver(() => this.resizeViewport()); this.resize.observe(host);
    this.resizeViewport(); this.renderer.setAnimationLoop(time => this.frame(time));
  }

  private keep<T extends { dispose(): void }>(resource: T): T { this.resources.add(resource); return resource; }
  private material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, this.keep(new THREE.MeshStandardMaterial({ color, roughness: .78, metalness: .02 })));
    return this.materials.get(color)!;
  }
  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, size: [number, number, number], at: [number, number, number]) {
    const model = new THREE.Mesh(geometry, this.material(color)); model.scale.set(...size); model.position.set(...at);
    model.castShadow = true; model.receiveShadow = true; parent.add(model); return model;
  }
  private box(parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], color: string, round = false) {
    return this.mesh(parent, round ? this.round : this.cube, color, size, at);
  }
  private world(x: number, z: number) { return new THREE.Vector3(x - 3.5, 0, z - 3.5); }
  private label(text: string, x: number, z: number, size = .42) {
    const surface = document.createElement('canvas'); surface.width = surface.height = 128;
    const ctx = surface.getContext('2d')!; ctx.font = '700 82px system-ui'; ctx.fillStyle = '#385b36';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 67);
    const texture = this.keep(new THREE.CanvasTexture(surface)); texture.colorSpace = THREE.SRGBColorSpace;
    const model = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(size, size)), this.keep(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
    model.rotation.x = -Math.PI / 2; model.position.set(x, .045, z); this.scene.add(model);
  }
  private buildBoard() {
    this.box(this.scene, [8.8, .28, 8.8], [0, -.24, 0], '#849e6b', true);
    this.box(this.scene, [8.74, .05, 8.74], [0, -.075, 0], '#d5e0bf');
    for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
      const edge = x === 0 || z === 0 || x === 7 || z === 7;
      this.box(this.scene, [.982, .10, .982], [x - 3.5, -.025, z - 3.5],
        edge ? ((x + z) % 2 ? '#a8c786' : '#c8dcab') : ((x + z) % 2 ? '#c9ddad' : '#fbf0d7'));
    }
    for (const side of [-1, 1]) {
      this.box(this.scene, [8.06, .035, .035], [0, .042, side * 4.01], '#6b8d51');
      this.box(this.scene, [.035, .035, 8.06], [side * 4.01, .042, 0], '#6b8d51');
      // A dashed inner border makes the outer delivery ring easy to read in every view.
      for (let n = 0; n < 24; n++) {
        this.box(this.scene, [.12, .012, .025], [-2.88 + n * .25, .034, side * 3], '#8ba369');
        this.box(this.scene, [.025, .012, .12], [side * 3, .034, -2.88 + n * .25], '#8ba369');
      }
    }
    for (let n = 0; n < 8; n++) { this.label(String(n), n - 3.5, 4.22); this.label(String(n), -4.24, 3.5 - n); }
    this.label('X', 4.18, 4.22, .3); this.label('Y', -4.24, -4.14, .3);
    const start = new THREE.Mesh(this.keep(new THREE.RingGeometry(.34, .38, 32)), this.material('#5d824a'));
    start.rotation.x = -Math.PI / 2; start.position.set(-3.5, .037, 3.5); this.scene.add(start);
  }
  private buildBerry() {
    const group = new THREE.Group();
    for (let n = 0; n < 5; n++) {
      const angle = n * Math.PI * 2 / 5;
      const leaf = this.mesh(group, this.sphere, n % 2 ? '#5e963f' : '#447a36', [.19, .035, .085], [Math.cos(angle) * .17, .07, Math.sin(angle) * .17]);
      leaf.rotation.y = -angle;
    }
    this.mesh(group, this.berryShape, '#df4847', [1, 1, 1], [0, 0, 0]);
    for (const [row, y, radius] of [[0, .27, .19], [1, .42, .275], [2, .56, .278]]) {
      for (let n = 0; n < 7; n++) {
        const angle = (n + row * .5) * Math.PI * 2 / 7;
        const seed = this.mesh(group, this.sphere, '#ffe5a2', [.019, .029, .01], [Math.sin(angle) * radius, y, Math.cos(angle) * radius]); seed.rotation.y = angle;
      }
    }
    for (let n = 0; n < 6; n++) {
      const angle = n * Math.PI / 3;
      const leaf = this.mesh(group, this.sphere, '#427c3e', [.16, .025, .065], [Math.cos(angle) * .09, .657, Math.sin(angle) * .09]); leaf.rotation.y = -angle;
    }
    const stem = this.box(group, [.035, .15, .035], [.012, .72, 0], '#467640'); stem.rotation.z = -.2;
    return group;
  }
  private buildRobot() {
    this.scene.add(this.robot);
    this.keep(this.model); this.model.root.scale.setScalar(.04); this.model.root.position.y = .03;
    this.robot.add(this.model.root); this.renderer.domElement.dataset.vehicleModel = '000_saikao';
  }
  private buildCompass() {
    this.compass.classList.add('farm-compass'); this.compass.setAttribute('viewBox', '-45 -45 90 90');
    this.compass.setAttribute('role', 'img'); this.compass.setAttribute('aria-label', '棋盘方向：上方为 Y 增大方向');
    this.compass.innerHTML = '<circle r="42" fill="#fffef5ed" stroke="#ccdabc"/><text y="-27" text-anchor="middle" fill="#45673c" font-size="11">Y ↑</text>';
    this.compassNeedle.innerHTML = '<path d="M0 -21 7 12 0 7 -7 12Z" fill="#528047"/><path d="M0 21 5 10 0 12 -5 10Z" fill="#c1cbaf"/>';
    this.compass.append(this.compassNeedle); this.host.append(this.compass);
  }
  update(state: ThirdSnapshot, reset = false) {
    const fresh = reset || state.actions < this.state.actions;
    this.state = state; this.destination.copy(this.world(state.x, state.z));
    if (fresh || this.reducedMotion) { this.robot.position.copy(this.destination); this.robot.rotation.y = -state.heading; }
    for (const obj of state.objects) {
      const model = this.berries.get(obj.id)!; model.visible = !state.collected.includes(obj.id) && state.holding !== obj.id;
      model.position.copy(this.world(obj.x, obj.z));
    }
    this.carried.visible = Boolean(state.holding);
    const offset = state.holding ? 3.6 : 8.9; this.model.setFingers([-offset, offset]);
  }
  private resizeViewport() {
    if (this.disposed) return;
    this.renderer.setSize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight), false);
    this.camera.aspect = Math.max(1, this.host.clientWidth) / Math.max(1, this.host.clientHeight); this.camera.updateProjectionMatrix();
    if (this.view !== 'follow') this.fitCamera(this.view);
  }
  private fitCamera(view: CameraView) {
    // City-style perspective, fitted and centered around the entire board including its axes.
    const direction = (view === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(.22, 1.12, 1)).normalize();
    const center = new THREE.Vector3(-.1, .12, .1);
    this.camera.position.copy(center).add(direction); this.camera.lookAt(center); this.camera.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), tanH = tanV * this.camera.aspect;
    const points = this.fitPoints.map(point => point.clone().sub(center));
    const extent = (axis: THREE.Vector3, tangent: number) => {
      const slope = tangent * .94;
      const lower = Math.max(...points.map(p => p.dot(axis) + slope * p.dot(direction)));
      const upper = Math.min(...points.map(p => p.dot(axis) - slope * p.dot(direction)));
      return { distance: (lower - upper) / (2 * slope), center: (lower + upper) / 2 };
    };
    const horizontal = extent(right, tanH), vertical = extent(up, tanV);
    const distance = Math.max(horizontal.distance, vertical.distance, ...points.map(p => p.dot(direction) + 1));
    center.addScaledVector(right, horizontal.center).addScaledVector(up, vertical.center);
    this.controls.target.copy(center); this.camera.position.copy(center).addScaledVector(direction, distance); this.controls.update();
  }
  setView(view: CameraView) {
    const damping = this.controls.enableDamping; this.controls.enableDamping = false; this.controls.update(); this.controls.enableDamping = damping;
    this.view = view; this.onView(view); this.controls.enablePan = view !== 'follow';
    if (view === 'follow') {
      this.controls.target.copy(this.robot.position); this.controls.target.y = .2;
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(2.8, 4.5, 4.5)); this.controls.update();
    } else this.fitCamera(view);
  }
  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update();
  }
  private frame(time: number) {
    if (this.disposed) return;
    const dt = Math.min(.05, Math.max(0, (time - this.lastFrame) / 1000)); this.lastFrame = time;
    this.robot.position.lerp(this.destination, this.reducedMotion ? 1 : 1 - Math.exp(-dt * 24));
    if (this.robot.position.distanceTo(this.destination) < .002) this.robot.position.copy(this.destination);
    const turn = Math.atan2(Math.sin(-this.state.heading - this.robot.rotation.y), Math.cos(-this.state.heading - this.robot.rotation.y));
    this.robot.rotation.y += turn * (this.reducedMotion ? 1 : 1 - Math.exp(-dt * 24));
    if (this.view === 'follow') {
      const delta = this.robot.position.clone(); delta.y = .2; delta.sub(this.controls.target);
      this.controls.target.add(delta); this.camera.position.add(delta);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
    this.compassNeedle.setAttribute('transform', `rotate(${-THREE.MathUtils.radToDeg(this.controls.getAzimuthalAngle())})`);
    if (++this.diagnostics % 5 === 0) {
      const canvas = this.renderer.domElement;
      canvas.dataset.ready = 'true'; canvas.dataset.view = this.view;
      canvas.dataset.camera = this.camera.position.toArray().map(n => n.toFixed(3)).join(',');
      canvas.dataset.target = this.controls.target.toArray().map(n => n.toFixed(3)).join(',');
      canvas.dataset.vehicle = this.robot.position.toArray().map(n => n.toFixed(3)).join(',');
      canvas.dataset.heading = this.robot.rotation.y.toFixed(3); canvas.dataset.holding = this.state.holding || '';
      canvas.dataset.berries = JSON.stringify([...this.berries].filter(([, g]) => g.visible).map(([id, g]) => ({ id, x: g.position.x + 3.5, y: 3.5 - g.position.z })));
      const projected = this.fitPoints.map(p => p.clone().project(this.camera));
      canvas.dataset.bounds = JSON.stringify([Math.min(...projected.map(p => p.x)), Math.min(...projected.map(p => p.y)), Math.max(...projected.map(p => p.x)), Math.max(...projected.map(p => p.y))]);
    }
  }
  dispose() {
    this.disposed = true; this.renderer.setAnimationLoop(null); this.resize.disconnect(); this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.lost);
    for (const resource of this.resources) resource.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); this.compass.remove();
  }
}
