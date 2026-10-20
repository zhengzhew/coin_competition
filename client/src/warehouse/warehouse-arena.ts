import * as THREE from 'three';
import { WAREHOUSE_RULES, type ThirdDemo } from '@coin-path/shared';
import { drawSimulationMapGrid } from '../third/simulation3d/map-grid';

export function buildWarehouseArena(
  scene: THREE.Scene, config: ThirdDemo['scene_config'],
  keep: <T extends { dispose(): void }>(resource: T) => T,
  material: (color: string) => THREE.MeshStandardMaterial,
) {
  const surface = document.createElement('canvas'); surface.width = surface.height = 1536;
  const ctx = surface.getContext('2d')!;
  ctx.fillStyle = '#eef0eb'; ctx.fillRect(0, 0, surface.width, surface.height);
  drawSimulationMapGrid(ctx, config.width, config.depth, { edge: '#dde2dc', major: '#b9c5c5', minor: '#d4dcda' });
  ctx.save(); ctx.scale(surface.width / config.width, surface.height / config.depth);
  ctx.fillStyle = '#e5d5b4'; ctx.fillRect(18, 102, 96, 12);
  ctx.fillStyle = '#657678'; ctx.font = '2px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('出发区', 12, 119);
  ctx.strokeStyle = '#74898c'; ctx.lineWidth = .3; ctx.strokeRect(0, 0, 120, 120);
  for (const zone of config.zones ?? []) {
    ctx.fillStyle = zone.color + '38'; ctx.fillRect(zone.x - 6, zone.z - 6, 12, 12);
    ctx.strokeStyle = zone.color; ctx.lineWidth = WAREHOUSE_RULES.lineWidth;
    ctx.strokeRect(zone.x - 6, zone.z - 6, 12, 12);
    ctx.fillStyle = '#304954'; ctx.font = 'bold 2.7px sans-serif';
    ctx.fillText(`${zone.id} 投递区`, zone.x, zone.z - 8);
  }
  ctx.restore();
  const texture = keep(new THREE.CanvasTexture(surface)); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(config.width, config.depth)),
    keep(new THREE.MeshStandardMaterial({ map: texture, roughness: .92 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(60, .35, 60); ground.receiveShadow = true; scene.add(ground);
  const box = (size: [number, number, number], position: [number, number, number], color: string) => {
    const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(...size)), material(color));
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  };
  for (const x of [-1, 121]) box([1.5, 2, 123], [x, 1, 60], '#627579');
  for (const z of [-1, 121]) box([120, 2, 1.5], [60, 1, z], '#627579');
  // Warehouse shelving is outside the playable boundary, so artwork never hides a collision.
  for (const x of [24, 60, 96]) {
    for (const dx of [-12, 12]) box([1, 16, 1], [x + dx, 8, -9], '#526b73');
    for (const y of [1, 8, 15]) box([27, .7, 8], [x, y, -9], '#7c9395');
    for (const dx of [-7, 5]) for (const y of [3.5, 10.5]) box([7, 4, 5], [x + dx, y, -9], '#caa577');
  }
}
