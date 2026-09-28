import * as THREE from 'three';
import { THIRD_DIMENSIONS, THIRD_FARM_LAYOUT, type ThirdSceneConfig } from '@coin-path/shared';

/** Original procedural competition props inspired by the user's farm arena reference. */
export function buildFarmArena(root: THREE.Scene, physical: ThirdSceneConfig,
  keep: <T extends { dispose(): void }>(resource: T) => T,
  material: (color: string) => THREE.MeshStandardMaterial) {
  const config = THIRD_FARM_LAYOUT;
  const scene = new THREE.Group();
  const sx = physical.width / config.width, sz = physical.depth / config.depth;
  scene.scale.set(sx, (sx + sz) / 2, sz); scene.position.set(sx / 2, 0, sz / 2); root.add(scene);
  function mesh(geometry: THREE.BufferGeometry, color: string, at: [number, number, number], parent: THREE.Object3D = scene) {
    const object = new THREE.Mesh(keep(geometry), material(color)); object.position.set(...at);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const box = (size: [number, number, number], at: [number, number, number], color: string, parent?: THREE.Object3D) => mesh(new THREE.BoxGeometry(...size), color, at, parent);
  const cylinder = (radius: number, height: number, at: [number, number, number], color: string) => mesh(new THREE.CylinderGeometry(radius, radius, height, 24), color, at);
  const floorCanvas = document.createElement('canvas'); floorCanvas.width = config.width * 128; floorCanvas.height = config.depth * 128;
  const ctx = floorCanvas.getContext('2d')!;
  ctx.fillStyle = '#f6fcf9'; ctx.fillRect(0, 0, floorCanvas.width, floorCanvas.height);
  const at = (n: number) => (n + .5) * 128;
  function zone(x: number, z: number, w: number, d: number, color: string, title: string) {
    ctx.fillStyle = color; ctx.fillRect(at(x), at(z), w * 128, d * 128);
    ctx.fillStyle = '#5d7c70'; ctx.font = '17px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(title, at(x + w / 2), at(z) + 25);
  }
  zone(.1, .5, 2.8, 3.8, '#e5f4d9', 'CORN & GREENHOUSE');
  zone(3.4, .6, 2.3, 2.5, '#fcf4d1', 'WHEAT');
  zone(7.2, .5, 3.2, 3.1, '#dff4ed', 'GREENHOUSE');
  zone(10.8, .5, 2.4, 3.2, '#e5f4f3', 'WATER');
  zone(.1, 6.1, 3.1, 3.7, '#dff5e6', 'BEANS');
  ctx.setLineDash([]); ctx.strokeStyle = '#3f4d4c'; ctx.lineWidth = 7;
  for (const [x1, z1, x2, z2] of [[1, 5, 12, 5], [6, 1, 6, 9], [3, 1.5, 3, 8], [10, 1.5, 10, 7.7]]) {
    ctx.beginPath(); ctx.moveTo(at(x1), at(z1)); ctx.lineTo(at(x2), at(z2)); ctx.stroke();
    const dx = x1 === x2 ? .25 : 0, dz = x1 === x2 ? 0 : .25;
    for (const [x, z] of [[x1, z1], [x2, z2]]) { ctx.beginPath(); ctx.moveTo(at(x - dx), at(z - dz)); ctx.lineTo(at(x + dx), at(z + dz)); ctx.stroke(); }
  }
  ctx.fillStyle = '#dcdaf1'; ctx.beginPath(); ctx.arc(at(10), at(8.5), 245, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4d36c'; ctx.lineWidth = 23;
  for (let n = 0; n < 30; n++) { const angle = n * Math.PI / 15; ctx.beginPath(); ctx.moveTo(at(10) + Math.cos(angle) * 140, at(8.5) + Math.sin(angle) * 140); ctx.lineTo(at(10) + Math.cos(angle) * 205, at(8.5) + Math.sin(angle) * 205); ctx.stroke(); }
  for (const [i, color] of ['#edce65', '#f0b85b', '#73bc92'].entries()) {
    ctx.fillStyle = color; ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(at(9 + i), at(8), 43, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeRect(at(9 + i) - 20, at(8) - 15, 40, 30);
  }
  // Physical measurement grid: exactly 10 x 10 cells, each 12 cm square.
  const px = floorCanvas.width / physical.width, pz = floorCanvas.height / physical.depth;
  ctx.strokeStyle = '#5f8077'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
  for (let x = 0; x <= physical.width; x += THIRD_DIMENSIONS.cell) {
    ctx.beginPath(); ctx.moveTo(x * px, 0); ctx.lineTo(x * px, floorCanvas.height); ctx.stroke();
  }
  for (let z = 0; z <= physical.depth; z += THIRD_DIMENSIONS.cell) {
    ctx.beginPath(); ctx.moveTo(0, z * pz); ctx.lineTo(floorCanvas.width, z * pz); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.fillStyle = '#234e53'; ctx.font = 'bold 40px sans-serif';
  for (let cm = 12; cm <= 108; cm += 12) {
    ctx.textAlign = 'center'; ctx.fillText(String(cm), cm * px, floorCanvas.height - 30);
    ctx.textAlign = 'left'; ctx.fillText(String(cm), 10, (physical.depth - cm) * pz);
  }
  ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('(0, 0)', 10, floorCanvas.height - 30);
  ctx.fillText('Y 120 cm', 10, 55); ctx.textAlign = 'right';
  ctx.fillText('X 120 cm', floorCanvas.width - 10, floorCanvas.height - 85);
  ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('120 x 120 cm / 12 cm GRID', floorCanvas.width / 2, 30);
  const hx = physical.start.x * px, hz = physical.start.z * pz;
  ctx.strokeStyle = '#779b89'; ctx.lineWidth = 3;
  ctx.strokeRect(hx - 9.5 * px, hz - 9.5 * pz, 19 * px, 19 * pz);
  ctx.font = '20px sans-serif'; ctx.fillText('HOME', hx, hz + 12 * pz);
  const texture = keep(new THREE.CanvasTexture(floorCanvas)); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const mat = keep(new THREE.MeshStandardMaterial({ map: texture, roughness: .9 }));
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(config.width, config.depth)), mat);
  floor.rotation.x = -Math.PI / 2; floor.position.set((config.width - 1) / 2, .04, (config.depth - 1) / 2); floor.receiveShadow = true; scene.add(floor);
  // Aluminum perimeter with corner guards and regularly spaced joints.
  for (const z of [-.5, config.depth - .5]) {
    box([config.width + .15, .28, .13], [(config.width - 1) / 2, .18, z], '#a8b7b8');
    box([config.width + .15, .05, .16], [(config.width - 1) / 2, .35, z], '#eff6f4');
    for (let x = 0; x < config.width; x += 1.5) box([.025, .27, .14], [x, .18, z], '#718c8c');
  }
  for (const x of [-.5, config.width - .5]) {
    box([.13, .28, config.depth], [x, .18, (config.depth - 1) / 2], '#a8b7b8');
    box([.16, .05, config.depth], [x, .35, (config.depth - 1) / 2], '#eff6f4');
    for (const z of [-.5, config.depth - .5]) box([.2, .05, .2], [x, .4, z], '#ebae5b');
  }
  function field(x: number, z: number, width: number, depth: number, corn: boolean) {
    box([width, .12, depth], [x, .12, z], '#b39360');
    box([width - .13, .05, depth - .13], [x, .2, z], '#756c49');
    const rows = Math.floor(depth / .35), cols = Math.floor(width / .36);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const px = x - width / 2 + .2 + i * .36, pz = z - depth / 2 + .2 + j * .35;
      cylinder(.022, corn ? .52 : .2, [px, corn ? .49 : .32, pz], '#83965c');
      for (const side of [-1, 1]) {
        const leaf = mesh(new THREE.SphereGeometry(.09, 7, 5), corn ? '#9fab66' : '#93bc7c', [px + side * .08, corn ? .48 : .42, pz]);
        leaf.scale.set(1.3, .5, .8); leaf.rotation.z = side * .4;
      }
      if (corn) mesh(new THREE.SphereGeometry(.065, 8, 6), '#dec566', [px, .8, pz]).scale.y = 1.65;
    }
  }
  field(1.5, 2.5, 1.92, 1.92, true); field(4.5, 2, 1.92, .92, true); field(1.5, 7.5, 1.92, 1.92, false);
  // One greenhouse occupies the same footprint as its collision cells.
  box([1.97, .09, .99], [8.5, .12, 2], '#aac4af');
  const archMaterial = keep(new THREE.MeshStandardMaterial({ color: '#cfebdf', transparent: true, opacity: .25, roughness: .2, side: THREE.DoubleSide, depthWrite: false }));
  const cover = new THREE.Mesh(keep(new THREE.CylinderGeometry(.92, .92, .92, 28, 1, true, 0, Math.PI)), archMaterial);
  cover.rotation.x = Math.PI / 2; cover.rotation.z = Math.PI / 2; cover.position.set(8.5, .16, 2); scene.add(cover);
  for (const z of [1.54, 1.77, 2, 2.23, 2.46]) {
    const points = Array.from({ length: 25 }, (_, i) => { const a = i / 24 * Math.PI; return new THREE.Vector3(8.5 + Math.cos(a) * .92, .16 + Math.sin(a) * .92, z); });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, .018, 6, false), '#f3f6ef', [0, 0, 0]);
  }
  for (const x of [7.9, 8.3, 8.7, 9.1]) mesh(new THREE.SphereGeometry(.14, 8, 6), '#83a77b', [x, .28, 2]).scale.y = .65;
  for (const [x, z] of [[12, 2], [12, 8]]) {
    const elevated = z === 2;
    for (const dx of [-.3, .3]) for (const dz of [-.3, .3]) box([.05, elevated ? 1.0 : .2, .05], [x + dx, elevated ? .58 : .15, z + dz], '#889d99');
    cylinder(.44, elevated ? .55 : 1.1, [x, elevated ? 1.27 : .72, z], '#b6cdcc');
    mesh(new THREE.ConeGeometry(.45, .23, 28), '#dbe9e4', [x, elevated ? 1.66 : 1.385, z]);
    for (let y = .3; y < 1.2; y += .17) {
      const ring = mesh(new THREE.TorusGeometry(.446, .012, 5, 28), '#819d9a', [x, elevated ? y + .75 : y, z]); ring.rotation.x = Math.PI / 2;
      if (elevated && y > .65) ring.visible = false;
    }
  }
  box([1.95, .75, .95], [11.5, .45, 10], '#98ada2'); box([2.05, .13, 1.06], [11.5, .9, 10], '#d1dcd1');
  box([1.15, .05, .62], [11.5, .995, 10], '#547b7e');
  box([.8, .5, .03], [11.5, .37, 9.51], '#607e6d');
}
