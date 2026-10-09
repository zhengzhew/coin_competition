import * as THREE from 'three';
import { BEACH_EDGE_WIDTH, type ThirdSceneConfig } from '@coin-path/shared';

type Keep = <T extends { dispose(): void }>(resource: T) => T;
type Material = (color: string) => THREE.MeshStandardMaterial;

export function buildShell(parent: THREE.Group, keep: Keep, material: Material, color: string) {
  // A scallop fan fits the same 6 × 6 cm footprint used by the contact solver.
  const vertices: number[] = [], indices: number[] = [];
  const segments = 24, rings = 8;
  for (let r = 0; r <= rings; r++) for (let i = 0; i <= segments; i++) {
    const t = i / segments * Math.PI, radius = r / rings;
    vertices.push(Math.cos(t) * 3 * radius, .65 + Math.sin(Math.PI * radius) * 1.5 + Math.sin(i / segments * Math.PI * 10) ** 2 * .18 * radius,
      2.5 - Math.sin(t) * 5.5 * radius);
    if (r && i) { const k = r * (segments + 1) + i; indices.push(k, k - 1, k - segments - 2, k, k - segments - 2, k - segments - 1); }
  }
  const geometry = keep(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const surface = keep(material(color).clone()); surface.side = THREE.DoubleSide;
  const shell = new THREE.Mesh(geometry, surface); shell.castShadow = true; shell.receiveShadow = true; parent.add(shell);
  const base = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 16, 8)), material(color)); base.scale.set(1.4, .6, 1.2); base.position.set(0, .65, 2); parent.add(base);
}

export function buildBeachArena(scene: THREE.Scene, config: ThirdSceneConfig, keep: Keep, material: Material) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1536;
  const ctx = canvas.getContext('2d')!, scale = canvas.width / config.width, edge = BEACH_EDGE_WIDTH * scale;
  ctx.fillStyle = '#f2deb0'; ctx.fillRect(0, 0, 1536, 1536);
  // Deterministic sand grain, without image or network dependencies.
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = i % 2 ? '#cab17c35' : '#fff8dc70';
    ctx.fillRect((i * 227) % 1536, (i * 479 + i * i) % 1536, 2, 2);
  }
  ctx.fillStyle = '#b8e1db';
  ctx.fillRect(0, 0, 1536, edge); ctx.fillRect(0, 1536 - edge, 1536, edge);
  ctx.fillRect(0, edge, edge, 1536 - edge * 2); ctx.fillRect(1536 - edge, edge, edge, 1536 - edge * 2);
  ctx.strokeStyle = '#4b9d9980'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
  ctx.strokeRect(edge, edge, 1536 - edge * 2, 1536 - edge * 2); ctx.setLineDash([]);
  ctx.strokeStyle = '#b8996140'; ctx.lineWidth = 1;
  for (let i = 12; i < 120; i += 12) { const p = i * scale; ctx.beginPath(); ctx.moveTo(p, edge); ctx.lineTo(p, 1536 - edge); ctx.moveTo(edge, p); ctx.lineTo(1536 - edge, p); ctx.stroke(); }
  ctx.fillStyle = '#307c81'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 23px system-ui';
  for (let i = 0; i <= 120; i += 12) {
    const p = Math.max(25, Math.min(1510, i * scale));
    ctx.fillText(String(i), p, 1510); if (i > 0) ctx.fillText(String(i), 27, 1536 - p);
  }
  ctx.font = '600 28px system-ui'; ctx.fillText('岸 边 交 付 区', 768, edge / 2); ctx.fillText('X →', 1230, 1460);
  const texture = keep(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(config.width, config.depth)), keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set(config.width / 2, .4, config.depth / 2); ground.receiveShadow = true; scene.add(ground);
  // Low sculpted surf sits outside the physical map, preserving a clear playable area.
  const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(800, 800)), material('#87c5cc'));
  sea.rotation.x = -Math.PI / 2; sea.position.set(60, -2.4, 60); scene.add(sea);
  for (let i = 0; i < 4; i++) {
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, j) => new THREE.Vector3(-28 + j * 8, -1.9, -14 - i * 12 + Math.sin(j * .8) * 2)));
    const wave = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 64, .35, 4, false)), material('#d9f2ed')); scene.add(wave);
  }
  for (const [x, z, size] of [[-9, 22, 4], [-7, 27, 2.6], [128, 95, 3], [130, 100, 2]] as const) {
    const rock = new THREE.Mesh(keep(new THREE.DodecahedronGeometry(size, 0)), material('#d3bd96')); rock.position.set(x, -.1, z); rock.scale.y = .65; rock.castShadow = true; scene.add(rock);
  }
}
