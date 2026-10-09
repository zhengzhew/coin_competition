import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { Box3, Vector3 } from 'three';

const source = process.argv[2];
if (!source) throw new Error('Pass the source OBJ path');
const root = new OBJLoader().parse(readFileSync(source, 'utf8'));
const all = new Box3().setFromObject(root), entries = [];
root.traverse(mesh => {
  if (!mesh.isMesh) return;
  const box = new Box3().setFromObject(mesh);
  entries.push({ name: mesh.name, triangles: mesh.geometry.attributes.position.count / 3,
    material: Array.isArray(mesh.material) ? mesh.material.map(m => m.name) : mesh.material.name,
    min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new Vector3()).toArray(), centre: box.getCenter(new Vector3()).toArray() });
});
mkdirSync('outputs/robot-model', { recursive: true });
writeFileSync('outputs/robot-model/source-inspection.json', JSON.stringify({ min: all.min.toArray(), max: all.max.toArray(), meshes: entries }, null, 2));
console.log(JSON.stringify({ min: all.min.toArray(), max: all.max.toArray(), count: entries.length,
  triangles: entries.reduce((s, m) => s + m.triangles, 0), materials: [...new Set(entries.flatMap(m => m.material))],
  largest: entries.sort((a, b) => b.triangles - a.triangles).slice(0, 24) }, null, 2));
