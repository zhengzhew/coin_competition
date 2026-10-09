import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { THIRD_DIMENSIONS as D, thirdMapPosition, type ThirdDemo, type ThirdSnapshot } from '@coin-path/shared';
import { createSaikaoRobot } from '../../components/SaikaoRobot';
import { buildFarmArena } from './farm-arena';
import { buildBeachArena, buildShell } from '../../beach/beach-arena';

type View = 'orbit' | 'top' | 'follow';
export default function SimulationScene({ demo, state, onReady }: {
  demo: ThirdDemo; state: ThirdSnapshot; onReady: (ready: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(state); latest.current = state;
  const view = useRef<View>('orbit');
  const changeView = useRef<(view: View) => void>(() => {});
  const changePan = useRef<(enabled: boolean) => void>(() => {});
  const zoom = useRef<(factor: number) => void>(() => {});
  const [selectedView, setSelectedView] = useState<View>('orbit');
  const [panMode, setPanMode] = useState(false);
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
    void (async () => { try {
      const model = await createSaikaoRobot();
      if (disposed) { model.dispose(); return; }
      keep(model);
      const config = demo.scene_config;
      const beach = demo.scene_task === 'seashell-edge';
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      const canvas = renderer.domElement;
      canvas.setAttribute('aria-label', '本地 3D 模拟场景，可拖动旋转、右键平移、滚轮缩放'); canvas.setAttribute('role', 'img');
      canvas.dataset.thirdScene = 'true';
      if (beach) canvas.dataset.beachScene = 'true';
      canvas.addEventListener('webglcontextlost', lost);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
      element.append(canvas);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(beach ? '#afd8dd' : '#ced6d4');
      const camera = new THREE.PerspectiveCamera(40, 1, 1, 800);
      controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 40; controls.maxDistance = 380;
      // Pan along the field, keeping the focus on its horizontal plane.
      controls.screenSpacePanning = false;
      const center = new THREE.Vector3(config.width / 2, 0, config.depth / 2);
      const clearInertia = () => {
        const damping = controls!.enableDamping;
        controls!.enableDamping = false; controls!.update(); controls!.enableDamping = damping;
      };
      changePan.current = enabled => {
        const following = view.current === 'follow';
        const panning = !following && (enabled || view.current === 'top');
        setPanMode(panning);
        controls!.enablePan = !following;
        controls!.enableRotate = view.current !== 'top';
        controls!.mouseButtons.LEFT = panning ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        controls!.touches.ONE = panning ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
        controls!.touches.TWO = following ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
        canvas.style.cursor = panning ? 'move' : 'grab';
      };
      changeView.current = next => {
        // Flush residual pan/rotation before locking a new focus.
        clearInertia();
        view.current = next; setSelectedView(next);
        changePan.current(false);
        if (next === 'follow') {
          controls!.target.set(latest.current.x, 1, latest.current.z);
          camera.position.copy(controls!.target).add(new THREE.Vector3(50, 74, 70));
          controls!.update();
          return;
        }
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
        controls!.update();
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
      box(scene, [config.width + 2, 2.2, config.depth + 2], [center.x, -.8, center.z], beach ? '#d7ba84' : '#becbb5');
      if (beach) buildBeachArena(scene, config, keep, material);
      else buildFarmArena(scene, config, keep, material);
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
        if (beach) {
          buildShell(group, keep, material, ['#ee9c83', '#d8b2d5', '#f2c06e', '#92cbbb'][config.objects.indexOf(obj) % 4]);
          label(group, obj.id, [0, 7, 0]);
        } else if (demo.category === 'collect') {
          const gem = new THREE.Mesh(keep(new THREE.OctahedronGeometry(2.8)), material('#e7b645')); gem.position.y = 4; gem.castShadow = true; group.add(gem);
          const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.2, 3.2, .4, 32)), material('#f4e5b7')); base.position.y = .6; group.add(base);
        } else { box(group, [D.cargo, D.cargo, D.cargo], [0, D.cargo / 2 + .4, 0], '#d9a25c'); box(group, [1.2, .04, D.cargo], [0, D.cargo + .42, 0], '#f2ce88'); label(group, obj.id, [0, 9, 0]); }
      }
      const robot = model.root; scene.add(robot); canvas.dataset.vehicleModel = '000_saikao';
      let framed = false;
      resize = new ResizeObserver(() => {
        const width = element.clientWidth, height = element.clientHeight;
        if (width && height) {
          renderer!.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
          // Fit once; resizing/fullscreen must preserve the user's focus and zoom.
          if (!framed) { changeView.current(view.current); framed = true; }
        }
      }); resize.observe(element);
      const followShift = new THREE.Vector3();
      let diagnosticFrame = 0;
      renderer.setAnimationLoop(() => {
        if (disposed) return;
        const current = latest.current;
        robot.position.set(current.x, 0, current.z); robot.rotation.y = -current.heading;
        model.setFingers(current.gripper?.fingers ?? [-1, 1].map(side => side * (D.gripperWidth - D.fingerWidth) / 2));
        for (const obj of current.objects) {
          const group = objects.get(obj.id)!;
          group.visible = demo.category === 'place' || !current.collected.includes(obj.id);
          const position = obj;
          group.position.set(position.x, 0, position.z); group.rotation.y = -(obj.heading || 0);
          if (beach) group.scale.setScalar(current.collected.includes(obj.id) ? .88 : 1);
        }
        if (view.current === 'follow') {
          // Move the orbit center and camera together without overwriting the user's angle or distance.
          followShift.set(current.x, 1, current.z).sub(controls!.target);
          controls!.target.add(followShift); camera.position.add(followShift);
        }
        controls!.update(); renderer!.render(scene, camera);
        if (++diagnosticFrame % 5 === 0) {
          canvas.dataset.view = view.current;
          canvas.dataset.camera = camera.position.toArray().map(n => n.toFixed(3)).join(',');
          canvas.dataset.target = controls!.target.toArray().map(n => n.toFixed(3)).join(',');
          canvas.dataset.vehicle = robot.position.toArray().map(n => n.toFixed(3)).join(',');
        }
      });
      canvas.dataset.ready = 'true'; setLoading(false); onReady(true);
    } catch {
      if (disposed) return;
      setLoading(false); setError('当前设备暂时无法启动 3D 画面。请重试加载，或使用支持 WebGL 的浏览器。'); onReady(false);
    } })();
    return () => {
      disposed = true; resize?.disconnect(); renderer?.setAnimationLoop(null); controls?.dispose();
      renderer?.domElement.removeEventListener('webglcontextlost', lost);
      for (const resource of resources) resource.dispose();
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); changeView.current = () => {}; changePan.current = () => {}; zoom.current = () => {};
    };
  }, [demo, generation, onReady]);
  const position = thirdMapPosition(state.x, state.z, demo.scene_config.depth);
  return <div className="board-viewport city3d-viewport third-simulation-viewport">
    <div className="city3d-toolbar" aria-label="地图视角"><div className="city3d-views">{([['orbit', '自由视角'], ['top', '俯视'], ['follow', '跟随小车']] as const).map(([id, label]) => <button key={id} aria-pressed={selectedView === id} disabled={loading || !!error} onClick={() => changeView.current(id)}>{label}</button>)}</div>
      <div className="city3d-tools"><button aria-label="平移视角" aria-pressed={panMode} title={selectedView === 'follow' ? '跟随时焦点锁定小车；切换自由视角可平移' : selectedView === 'top' ? '俯视时直接拖动即可平移' : '切换拖动平移；也可右键或 Shift + 拖动平移'} disabled={loading || !!error || selectedView !== 'orbit'} onClick={() => changePan.current(!panMode)}>平移</button><button disabled={loading || !!error} aria-label="放大地图" onClick={() => zoom.current(.8)}>＋</button><button disabled={loading || !!error} aria-label="缩小地图" onClick={() => zoom.current(1.25)}>－</button><button disabled={loading || !!error} onClick={() => changeView.current('orbit')}>复位</button><button onClick={() => void toggleFullscreen()}>{fullscreen ? '退出全屏' : '全屏'}</button></div>
    </div>
    <div ref={host} className="city3d-stage board-grid third-sim-host">
      {loading && !error && <div className="city3d-loading" role="status">正在准备本地三维场地…</div>}
      {error && <div className="city3d-loading city3d-error" role="alert"><p>{error}</p><button onClick={() => setGeneration(n => n + 1)}>重新加载场景</button></div>}
    </div>
    <div className="city3d-help third-map-coordinates"><span aria-label="精准定位读数">车体中心 X {position.x.toFixed(1)} · Y {position.y.toFixed(1)} cm · 朝向 <b data-testid="third-oid-heading">{((Math.round(state.heading * 180 / Math.PI * 10) % 3600 + 3600) % 3600 / 10).toFixed(1)}°</b>（左下角为零点，0° 向上）</span><span>{selectedView === 'follow' ? '焦点锁定小车 · 拖动旋转 · 滚轮 / 双指缩放' : panMode ? '拖动平移 · 滚轮 / 双指缩放' : '拖动旋转 · 右键 / Shift 拖动平移 · 双指平移缩放'}</span></div>
  </div>;
}
