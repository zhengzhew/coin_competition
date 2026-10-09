import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { THIRD_DIMENSIONS as D, THIRD_GRIP_CENTER } from '@coin-path/shared';

export const SAIKAO_MODEL_URL = '/assets/robots/saikao.glb';
let bytes: Promise<ArrayBuffer> | undefined;
export interface SaikaoRobot {
  root: THREE.Group;
  setFingers: (positions: readonly number[]) => void;
  dispose: () => void;
}

/** Model uses centimetres, ground at Y=0 and forward along -Z in both renderers. */
export async function createSaikaoRobot(): Promise<SaikaoRobot> {
  // Cache only immutable source bytes. Each scene owns and disposes its own GPU resources.
  bytes ??= fetch(SAIKAO_MODEL_URL).then(response => {
    if (!response.ok) throw new Error('小车模型加载失败');
    return response.arrayBuffer();
  }).catch(error => { bytes = undefined; throw error; });
  const gltf = await new GLTFLoader().parseAsync(await bytes, '/assets/robots/');
  const root = new THREE.Group(); root.name = 'saikao-robot'; root.add(gltf.scene);
  const resources = new Set<{ dispose(): void }>();
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true; object.receiveShadow = true; resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
  });
  const metal = new THREE.MeshStandardMaterial({ color: '#647b80', roughness: .6, metalness: .25 }); resources.add(metal);
  const box = (size: [number, number, number], position: [number, number, number]) => {
    const geometry = new THREE.BoxGeometry(...size); resources.add(geometry);
    const mesh = new THREE.Mesh(geometry, metal); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  // The source is a chassis without a gripper; retain the separately driven competition jaws.
  box([D.gripperWidth, 1.5, 1], [0, 4.5, -D.body / 2 + .5]);
  const jaws = [-1, 1].map(side => box([D.fingerWidth, 2, D.gripperLength], [side * (D.gripperWidth - D.fingerWidth) / 2, 2.5, -THIRD_GRIP_CENTER]));
  root.userData.model = '000_saikao';
  return { root, setFingers: positions => jaws.forEach((jaw, i) => jaw.position.x = positions[i]),
    dispose: () => { resources.forEach(resource => resource.dispose()); root.clear(); } };
}
