import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { THIRD_DIMENSIONS as D, THIRD_GRIP_CENTER, thirdMapPosition, type ThirdDemo, type ThirdSnapshot } from '@coin-path/shared';
import { buildFarmArena } from './farm-arena';

type View = 'orbit' | 'top' | 'follow';
export default function SimulationScene({ demo, state, onReady }: {
  demo: ThirdDemo; state: ThirdSnapshot; onReady: (ready: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(state); latest.current = state;
  const view = useRef<View>('orbit');
  const changeView = useRef<(view: View) => void>(() => {});
  const zoom = useRef<(factor: number) => void>(() => {});
  const [selectedView, setSelectedView] = useState<View>('orbit');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.current?.closest<HTMLElement>('.workspace-grid')?.requestFullscreen();
    } catch { /* Unsupported fullscreen leaves the normal scene usable. */ }
  };
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let resize: ResizeObserver | undefined;
    let disposed = false;
    const resources = new Set<{ dispose(): void }>();
    const keep = <T extends { dispose(): void }>(resource: T): T => { resources.add(resource); return resource; };
    const lost = (event: Event) => { event.preventDefault(); setError('三维画面暂时不可用，请重试加载。'); onReady(false); renderer?.setAnimationLoop(null); };
    onReady(false); setError(''); setLoading(true);
    try {
      const config = demo.scene_config;
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      const canvas = renderer.domElement;
      canvas.setAttribute('aria-label', '本地 3D 模拟场景'); canvas.setAttribute('role', 'img');
      canvas.dataset.thirdScene = 'true';
      canvas.addEventListener('webglcontextlost', lost);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
      element.append(canvas);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#ced6d4');
      const camera = new THREE.PerspectiveCamera(40, 1, 1, 800);
      controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 40; controls.maxDistance = 380;
      controls.enablePan = false;
      const center = new THREE.Vector3(config.width / 2, 0, config.depth / 2);
      changeView.current = next => {
        view.current = next; setSelectedView(next);
        controls!.target.copy(center);
        const direction = (next === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(.03, .67, .74)).normalize();
        const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
        const up = new THREE.Vector3().crossVectors(direction, right);
        const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        let distance = controls!.minDistance;
        // Fit every field corner in the actual viewport, including its front edge and origin labels.
        for (const x of [-2, config.width + 2]) for (const y of [0, 18]) for (const z of [-2, config.depth + 2]) {
          const offset = new THREE.Vector3(x, y, z).sub(center);
          distance = Math.max(distance, offset.dot(direction) + 1.08 * Math.max(
            Math.abs(offset.dot(up)) / tangent, Math.abs(offset.dot(right)) / (tangent * camera.aspect)));
        }
        camera.position.copy(center).addScaledVector(direction, distance);
        controls!.enableRotate = next === 'orbit'; controls!.update();
      };
      changeView.current('orbit');
      zoom.current = factor => {
        const offset = camera.position.clone().sub(controls!.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls!.minDistance, controls!.maxDistance));
        camera.position.copy(controls!.target).add(offset); controls!.update();
      };
      scene.add(new THREE.HemisphereLight('#ffffff', '#a5b29c', 1.7));
      const light = new THREE.DirectionalLight('#fff7df', 2.0); light.position.set(20, 150, 50); light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024); Object.assign(light.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, far: 500 });
      light.shadow.normalBias = .4; scene.add(light); resources.add({ dispose: () => light.shadow.dispose() });
      const materials = new Map<string, THREE.MeshStandardMaterial>();
      function material(color: string) {
        if (!materials.has(color)) materials.set(color, keep(new THREE.MeshStandardMaterial({ color, roughness: .72 })));
        return materials.get(color)!;
      }
      function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: string) {
        const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(...size)), material(color));
        mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
      }
      function label(parent: THREE.Object3D, text: string, position: [number, number, number]) {
        const surface = document.createElement('canvas'); surface.width = surface.height = 128;
        const ctx = surface.getContext('2d')!;
        ctx.fillStyle = '#294d3e'; ctx.font = 'bold 80px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 66);
        const texture = keep(new THREE.CanvasTexture(surface)); texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: texture, depthWrite: false })));
        sprite.position.set(...position); sprite.scale.set(5, 5, 1); parent.add(sprite);
      }
      box(scene, [config.width + 2, 2.2, config.depth + 2], [center.x, -.8, center.z], '#becbb5');
      buildFarmArena(scene, config, keep, material);
      for (const obj of config.objects) if (obj.goal) {
        for (const side of [-1, 1]) {
          box(scene, [D.cell, .3, .35], [obj.goal.x, .6, obj.goal.z + side * D.cell / 2], '#39885d');
          box(scene, [.35, .3, D.cell], [obj.goal.x + side * D.cell / 2, .6, obj.goal.z], '#39885d');
        }
        label(scene, obj.id, [obj.goal.x, 1, obj.goal.z]);
      }
      const objects = new Map<string, THREE.Group>();
      for (const obj of config.objects) {
        const group = new THREE.Group(); objects.set(obj.id, group); scene.add(group);
        if (demo.category === 'collect') {
          const gem = new THREE.Mesh(keep(new THREE.OctahedronGeometry(2.8)), material('#e7b645')); gem.position.y = 4; gem.castShadow = true; group.add(gem);
          const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.2, 3.2, .4, 32)), material('#f4e5b7')); base.position.y = .6; group.add(base);
        } else { box(group, [D.cargo, D.cargo, D.cargo], [0, D.cargo / 2 + .4, 0], '#d9a25c'); box(group, [1.2, .04, D.cargo], [0, D.cargo + .42, 0], '#f2ce88'); label(group, obj.id, [0, 9, 0]); }
      }
      const robot = new THREE.Group(); scene.add(robot);
      // The complete vehicle footprint (including wheels) is 19 x 19 cm.
      box(robot, [D.body, 3, D.body], [0, 6, 0], '#eaf0ed');
      box(robot, [17, .8, 17], [0, 7.9, 0], '#f8fcf9');
      for (let x = -6; x <= 6; x += 3) for (let z = -6; z <= 6; z += 3) box(robot, [.6, .2, .6], [x, 8.4, z], '#9eafac');
      for (const x of [-8.5, 8.5]) for (const z of [-5.8, 5.8]) {
        const wheel = new THREE.Mesh(keep(new THREE.CylinderGeometry(3, 3, 2, 18)), material('#35483f'));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 3.4, z); wheel.castShadow = true; robot.add(wheel);
      }
      box(robot, [D.gripperWidth, 1.5, 1], [0, 4.5, -9], '#70887b');
      const jaws = [-1, 1].map(side => ({ side, mesh: box(robot, [D.fingerWidth, 2, D.gripperLength],
        [side * (D.gripperWidth - D.fingerWidth) / 2, 2.5, -THIRD_GRIP_CENTER], '#70887b') }));
      box(robot, [6, 1, 1], [0, 7, -9], '#d5f5c0');
      resize = new ResizeObserver(() => {
        const width = element.clientWidth, height = element.clientHeight;
        if (width && height) { renderer!.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); changeView.current(view.current); }
      }); resize.observe(element);
      renderer.setAnimationLoop(() => {
        if (disposed) return;
        const current = latest.current;
        robot.position.set(current.x, 0, current.z); robot.rotation.y = -current.heading;
        for (const [index, jaw] of jaws.entries()) jaw.mesh.position.x = current.gripper?.fingers[index] ?? jaw.side * (D.gripperWidth - D.fingerWidth) / 2;
        for (const obj of current.objects) {
          const group = objects.get(obj.id)!;
          group.visible = demo.category === 'place' || !current.collected.includes(obj.id);
          const position = obj;
          group.position.set(position.x, 0, position.z); group.rotation.y = -(obj.heading || 0);
        }
        if (view.current === 'follow') {
          controls!.target.set(current.x, 1, current.z);
          camera.position.set(current.x + 50, 75, current.z + 70);
        }
        controls!.update(); renderer!.render(scene, camera);
      });
      canvas.dataset.ready = 'true'; setLoading(false); onReady(true);
    } catch {
      setLoading(false); setError('当前设备暂时无法启动 3D 画面。可重试，或返回选择棋盘模拟。'); onReady(false);
    }
    return () => {
      disposed = true; resize?.disconnect(); renderer?.setAnimationLoop(null); controls?.dispose();
      renderer?.domElement.removeEventListener('webglcontextlost', lost);
      for (const resource of resources) resource.dispose();
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); changeView.current = () => {}; zoom.current = () => {};
    };
  }, [demo, generation, onReady]);
  const position = thirdMapPosition(state.x, state.z, demo.scene_config.depth);
  return <div className="board-viewport city3d-viewport">
    <div className="city3d-toolbar" aria-label="地图视角"><div className="city3d-views">{([['orbit', '自由视角'], ['top', '俯视'], ['follow', '跟随']] as const).map(([id, label]) => <button key={id} aria-pressed={selectedView === id} disabled={loading || !!error} onClick={() => changeView.current(id)}>{label}</button>)}</div>
      <div className="city3d-tools"><button disabled={loading || !!error} aria-label="放大地图" onClick={() => zoom.current(.8)}>＋</button><button disabled={loading || !!error} aria-label="缩小地图" onClick={() => zoom.current(1.25)}>－</button><button disabled={loading || !!error} onClick={() => changeView.current('orbit')}>复位</button><button onClick={() => void toggleFullscreen()}>{fullscreen ? '退出全屏' : '全屏'}</button></div>
    </div>
    <div ref={host} className="city3d-stage board-grid third-sim-host">
      {loading && !error && <div className="city3d-loading" role="status">正在准备本地三维场地…</div>}
      {error && <div className="city3d-loading city3d-error" role="alert"><p>{error}</p><button onClick={() => setGeneration(n => n + 1)}>重新加载场景</button></div>}
    </div>
    <div className="city3d-help third-map-coordinates">车体中心 X {position.x.toFixed(1)} · Y {position.y.toFixed(1)} cm（左下角为零点）<span>拖动旋转 · 滚轮缩放</span></div>
  </div>;
}
