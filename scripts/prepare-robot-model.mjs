import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

// Offline conversion only. The large source OBJ is not shipped to browsers.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/prepare-robot-model.mjs <000_saikao.obj>');
const output = resolve('client/public/assets/robots/saikao.glb');
const input = readFileSync(source), sourceRoot = new OBJLoader().parse(input.toString('utf8'));
await MeshoptSimplifier.ready;
const buckets = new Map();
let sourceMeshes = 0, sourceTriangles = 0;
sourceRoot.traverse(mesh => {
  if (!mesh.isMesh) return;
  sourceMeshes++; sourceTriangles += mesh.geometry.attributes.position.count / 3;
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  // The OBJ has Z up, its long axis is Y, and a 190 mm chassis.
  const tyre = Math.abs(box.getCenter(new THREE.Vector3()).x) > 58 && box.min.y > -14 && box.max.y < 64 && box.getSize(new THREE.Vector3()).z > 65;
  const material = tyre ? 'tyres' : Array.isArray(mesh.material) ? 'details' : mesh.material.name;
  const geometry = mesh.geometry.clone(); geometry.deleteAttribute('uv');
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    position.setXYZ(i, x * .1, (z + 21.5) * .1, -(y - 45.5) * .1);
    if (normal) normal.setXYZ(i, normal.getX(i), normal.getZ(i), -normal.getY(i));
  }
  if (!buckets.has(material)) buckets.set(material, []);
  buckets.get(material).push(geometry);
});

const root = new THREE.Group(); root.name = 'saikao-chassis';
let triangles = 0;
for (const [name, pieces] of buckets) {
  const merged = mergeGeometries(pieces), geometry = mergeVertices(merged, 1e-5);
  merged.dispose(); pieces.forEach(g => g.dispose());
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const original = Uint32Array.from(geometry.index.array);
  const target = Math.max(3, Math.floor(original.length * .18 / 3) * 3);
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(original, positions, 3, normals, 3, [.25, .25, .25], null, target, .002, ['Permissive']);
  const [remap, count] = MeshoptSimplifier.compactMesh(simplified);
  const p = new Float32Array(count * 3), n = new Float32Array(count * 3);
  for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) {
    p.set(positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
    n.set(normals.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  }
  const compact = new THREE.BufferGeometry();
  compact.setAttribute('position', new THREE.BufferAttribute(p, 3)); compact.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  compact.setIndex(new THREE.BufferAttribute(count < 65536 ? Uint16Array.from(simplified) : simplified, 1));
  geometry.dispose(); triangles += simplified.length / 3;
  // Neutral substitute materials: the user supplied geometry without its .mtl file.
  const color = name === 'tyres' ? '#283339' : name === 'MTL1' ? '#b2bfc3' : name === 'MTL2' ? '#e5e9e7' : name === 'DEFAULT_MTL' ? '#a1b0b5' : '#59686d';
  const material = new THREE.MeshStandardMaterial({ name, color, roughness: name === 'tyres' ? .95 : .68, metalness: name === 'tyres' ? 0 : .18 });
  const mesh = new THREE.Mesh(compact, material); mesh.name = `saikao-${name}`; root.add(mesh);
}
// GLTFExporter writes a Blob; Node supplies Blob but not FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
const glb = await new GLTFExporter().parseAsync(root, { binary: true });
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, Buffer.from(glb));
const bounds = new THREE.Box3().setFromObject(root);
const manifest = { source: basename(source), sha256: createHash('sha256').update(input).digest('hex'), sourceBytes: input.byteLength,
  sourceMeshes, sourceTriangles, meshes: root.children.length, triangles, bytes: glb.byteLength,
  sizeCm: bounds.getSize(new THREE.Vector3()).toArray(), minCm: bounds.min.toArray(), maxCm: bounds.max.toArray(),
  transform: 'source mm Z-up → cm Y-up, forward +sourceY → -Z; origin (0,45.5,-21.5) mm',
  materials: 'neutral substitutes; source MTL was not supplied', geometry: 'proportions preserved, 19 cm chassis length; gripper is separate' };
writeFileSync(output.replace('.glb', '.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
