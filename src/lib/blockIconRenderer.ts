import * as THREE from "three";
import { getBlockAtlasTexture, getBlockUV } from "@/lib/textures";

const ICON_PX = 64;

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;

function getSharedRenderer() {
  if (!sharedRenderer || !sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = ICON_PX;
    sharedCanvas.height = ICON_PX;
    sharedRenderer = new THREE.WebGLRenderer({ canvas: sharedCanvas, alpha: true, antialias: true });
    sharedRenderer.setSize(ICON_PX, ICON_PX);
  }
  return { renderer: sharedRenderer, canvas: sharedCanvas };
}

const iconCache = new Map<number, string>();
let cacheVersion = 0;

export function clearIconCache() {
  iconCache.clear();
  cacheVersion++;
}

export function renderBlockIconToDataURL(blockType: number): string {
  const cached = iconCache.get(blockType);
  if (cached) return cached;

  const { renderer, canvas } = getSharedRenderer();
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(2, 1.8, 2);
  camera.lookAt(0, 0, 0);
  camera.zoom = 0.8;
  camera.updateProjectionMatrix();

  const atlas = getBlockAtlasTexture();
  const faceRows: (0 | 1 | 2)[] = [1, 1, 0, 2, 1, 1];

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;

  for (let face = 0; face < 6; face++) {
    const [u0, u1, v0, v1] = getBlockUV(blockType, faceRows[face]);
    const base = face * 4;
    uvAttr.setXY(base + 0, u0, v1);
    uvAttr.setXY(base + 1, u1, v1);
    uvAttr.setXY(base + 2, u0, v0);
    uvAttr.setXY(base + 3, u1, v0);
  }
  uvAttr.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 1, metalness: 0 });
  scene.add(new THREE.Mesh(geo, mat));

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(1, 2, 2);
  scene.add(dir);

  renderer.render(scene, camera);
  geo.dispose();
  mat.dispose();

  const dataURL = canvas.toDataURL();
  iconCache.set(blockType, dataURL);
  return dataURL;
}

export { ICON_PX };
