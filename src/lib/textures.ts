import * as THREE from "three";
import { BLOCK_TYPES } from "./terrain";

const CELL = 16;
const COLS = 9;
const ROWS = 3;

type Pixel = [number, number, number];
function px(r: number, g: number, b: number): Pixel { return [r, g, b]; }

// Seeded random for deterministic textures
function seededRand(seed: number) {
  let s = seed | 0;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// --- Minecraft-style pixel art textures ---

const GRASS_TOP: Pixel[][] = (() => {
  const rand = seededRand(1);
  const palette = [px(89,145,52), px(78,132,45), px(100,158,60), px(70,120,38), px(95,150,55)];
  return Array.from({length:16}, () => Array.from({length:16}, () => palette[Math.floor(rand()*palette.length)]));
})();

const GRASS_SIDE: Pixel[][] = (() => {
  const rand = seededRand(2);
  const grass = [px(89,145,52), px(78,132,45), px(95,150,55)];
  const dirt = [px(134,96,67), px(121,85,58), px(110,76,49), px(143,104,72)];
  return Array.from({length:16}, (_,r) => Array.from({length:16}, () => {
    if (r < 2) return grass[Math.floor(rand()*grass.length)];
    if (r === 2) return rand() > 0.5 ? grass[Math.floor(rand()*grass.length)] : dirt[Math.floor(rand()*dirt.length)];
    return dirt[Math.floor(rand()*dirt.length)];
  }));
})();

const DIRT: Pixel[][] = (() => {
  const rand = seededRand(3);
  const palette = [px(134,96,67), px(121,85,58), px(110,76,49), px(143,104,72), px(126,90,62)];
  return Array.from({length:16}, () => Array.from({length:16}, () => palette[Math.floor(rand()*palette.length)]));
})();

const STONE: Pixel[][] = (() => {
  const rand = seededRand(4);
  const palette = [px(125,125,125), px(115,115,115), px(105,105,105), px(135,135,135), px(98,98,98), px(140,140,140)];
  const rows: Pixel[][] = [];
  for (let r = 0; r < 16; r++) {
    const line: Pixel[] = [];
    for (let c = 0; c < 16; c++) {
      // Add some crack-like darker patches
      const v = rand();
      if (v < 0.08) line.push(px(80,80,80));
      else line.push(palette[Math.floor(rand()*palette.length)]);
    }
    rows.push(line);
  }
  return rows;
})();

const WOOD_TOP: Pixel[][] = (() => {
  const rows: Pixel[][] = [];
  const ring1 = px(176,137,79); const ring2 = px(148,112,58); const ring3 = px(120,88,42);
  const center = px(160,125,65); const bark = px(100,72,35);
  for (let r = 0; r < 16; r++) {
    const line: Pixel[] = [];
    for (let c = 0; c < 16; c++) {
      const dx = c - 7.5, dy = r - 7.5;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < 2) line.push(center);
      else if (dist < 4) line.push(ring1);
      else if (dist < 5.5) line.push(ring2);
      else if (dist < 7) line.push(ring1);
      else if (dist < 8) line.push(ring3);
      else line.push(bark);
    }
    rows.push(line);
  }
  return rows;
})();

const WOOD_SIDE: Pixel[][] = (() => {
  const rand = seededRand(5);
  const bark1 = px(104,78,40); const bark2 = px(88,64,30); const bark3 = px(118,90,50);
  const stripe = px(76,54,24);
  return Array.from({length:16}, (_,r) => Array.from({length:16}, (_,c) => {
    if (r % 5 === 0) return stripe;
    if (c % 4 === 0) return rand() > 0.4 ? bark2 : bark3;
    return rand() > 0.5 ? bark1 : bark3;
  }));
})();

const SAND: Pixel[][] = (() => {
  const rand = seededRand(6);
  const palette = [px(219,199,131), px(228,208,140), px(210,190,120), px(235,216,150), px(222,202,134)];
  return Array.from({length:16}, () => Array.from({length:16}, () => palette[Math.floor(rand()*palette.length)]));
})();

const WATER: Pixel[][] = (() => {
  const rand = seededRand(7);
  const palette = [px(38,98,200), px(48,112,215), px(28,82,185), px(55,125,225), px(35,90,195)];
  return Array.from({length:16}, () => Array.from({length:16}, () => palette[Math.floor(rand()*palette.length)]));
})();

const LEAVES: Pixel[][] = (() => {
  const rand = seededRand(8);
  const palette = [px(48,115,32), px(38,95,22), px(55,125,38), px(30,85,18), px(42,105,28)];
  const dark = px(20,60,10);
  return Array.from({length:16}, () => Array.from({length:16}, () => {
    if (rand() < 0.12) return dark;
    return palette[Math.floor(rand()*palette.length)];
  }));
})();

const SNOW: Pixel[][] = (() => {
  const rand = seededRand(9);
  const palette = [px(240,248,255), px(230,238,248), px(220,228,240), px(245,252,255), px(235,242,250)];
  return Array.from({length:16}, () => Array.from({length:16}, () => palette[Math.floor(rand()*palette.length)]));
})();

const SNOW_SIDE: Pixel[][] = (() => {
  const rand = seededRand(10);
  const snow = [px(240,248,255), px(230,238,248), px(235,242,250)];
  const dirt = [px(134,96,67), px(121,85,58), px(110,76,49), px(143,104,72)];
  return Array.from({length:16}, (_,r) => Array.from({length:16}, () => {
    if (r < 3) return snow[Math.floor(rand()*snow.length)];
    if (r === 3) return rand() > 0.4 ? snow[Math.floor(rand()*snow.length)] : dirt[Math.floor(rand()*dirt.length)];
    return dirt[Math.floor(rand()*dirt.length)];
  }));
})();

// [top, side, bottom]
const BLOCK_TEXTURES: Record<number, [Pixel[][], Pixel[][], Pixel[][]]> = {
  [BLOCK_TYPES.GRASS]: [GRASS_TOP, GRASS_SIDE, DIRT],
  [BLOCK_TYPES.DIRT]:  [DIRT, DIRT, DIRT],
  [BLOCK_TYPES.STONE]: [STONE, STONE, STONE],
  [BLOCK_TYPES.WOOD]:  [WOOD_TOP, WOOD_SIDE, WOOD_TOP],
  [BLOCK_TYPES.SAND]:  [SAND, SAND, SAND],
  [BLOCK_TYPES.WATER]: [WATER, WATER, WATER],
  [BLOCK_TYPES.LEAVES]:[LEAVES, LEAVES, LEAVES],
  [BLOCK_TYPES.SNOW]:  [SNOW, SNOW_SIDE, DIRT],
};

let cachedTexture: THREE.CanvasTexture | null = null;
let atlasCanvas: HTMLCanvasElement | null = null;

const atlasListeners: Set<() => void> = new Set();
export function onAtlasUpdate(cb: () => void): () => void {
  atlasListeners.add(cb);
  return () => { atlasListeners.delete(cb); };
}

function loadTextureOverlay(
  texture: THREE.CanvasTexture,
  canvas: HTMLCanvasElement,
  src: string,
  positions: [number, number][] // [col, row] pairs
) {
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext('2d')!;
    for (const [col, row] of positions) {
      ctx.drawImage(img, col * CELL, row * CELL, CELL, CELL);
    }
    texture.needsUpdate = true;
    atlasListeners.forEach(cb => cb());
  };
  img.src = src;
}

export function getBlockAtlasTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;

  const canvas = document.createElement('canvas');
  canvas.width = CELL * COLS;
  canvas.height = CELL * ROWS;
  atlasCanvas = canvas;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const data = imageData.data;

  function setPixel(col: number, row: number, px_: number, py_: number, pixel: Pixel) {
    const x = col * CELL + px_;
    const y = row * CELL + py_;
    const idx = (y * canvas.width + x) * 4;
    data[idx] = pixel[0]; data[idx+1] = pixel[1]; data[idx+2] = pixel[2]; data[idx+3] = 255;
  }

  const blockTypes = [BLOCK_TYPES.GRASS, BLOCK_TYPES.DIRT, BLOCK_TYPES.STONE, BLOCK_TYPES.WOOD, BLOCK_TYPES.SAND, BLOCK_TYPES.WATER, BLOCK_TYPES.LEAVES, BLOCK_TYPES.SNOW];
  
  blockTypes.forEach((bt, colIdx) => {
    const tex = BLOCK_TEXTURES[bt];
    if (!tex) return;
    const [top, side, bottom] = tex;
    for (let py = 0; py < CELL; py++)
      for (let px_ = 0; px_ < CELL; px_++) {
        setPixel(colIdx, 0, px_, py, top[py][px_]);
        setPixel(colIdx, 1, px_, py, side[py][px_]);
        setPixel(colIdx, 2, px_, py, bottom[py][px_]);
      }
  });

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  cachedTexture = texture;

  // Overlay real textures asynchronously
  const dirtCol = BLOCK_ATLAS_COL[BLOCK_TYPES.DIRT];
  const grassCol = BLOCK_ATLAS_COL[BLOCK_TYPES.GRASS];
  const snowCol = BLOCK_ATLAS_COL[BLOCK_TYPES.SNOW];
  const stoneCol = BLOCK_ATLAS_COL[BLOCK_TYPES.STONE];
  const sandCol = BLOCK_ATLAS_COL[BLOCK_TYPES.SAND];
  const woodCol = BLOCK_ATLAS_COL[BLOCK_TYPES.WOOD];

  loadTextureOverlay(texture, canvas, '/textures/dirt.webp', [
    [dirtCol, 0], [dirtCol, 1], [dirtCol, 2],
    [grassCol, 2], [snowCol, 2],
  ]);
  loadTextureOverlay(texture, canvas, '/textures/stone.webp', [
    [stoneCol, 0], [stoneCol, 1], [stoneCol, 2],
  ]);
  loadTextureOverlay(texture, canvas, '/textures/sand.webp', [
    [sandCol, 0], [sandCol, 1], [sandCol, 2],
  ]);
  loadTextureOverlay(texture, canvas, '/textures/wood_top.webp', [
    [woodCol, 0], [woodCol, 2],
  ]);
  loadTextureOverlay(texture, canvas, '/textures/wood_side.webp', [
    [woodCol, 1],
  ]);
  loadTextureOverlay(texture, canvas, '/textures/grass_top.webp', [
    [grassCol, 0],
  ]);
  loadTextureOverlay(texture, canvas, '/textures/grass_side.webp', [
    [grassCol, 1],
  ]);

  return texture;
}

const BLOCK_ATLAS_COL: Record<number, number> = {
  [BLOCK_TYPES.GRASS]: 0, [BLOCK_TYPES.DIRT]: 1, [BLOCK_TYPES.STONE]: 2, [BLOCK_TYPES.WOOD]: 3,
  [BLOCK_TYPES.SAND]: 4, [BLOCK_TYPES.WATER]: 5, [BLOCK_TYPES.LEAVES]: 6, [BLOCK_TYPES.SNOW]: 7,
};

export function getBlockUV(blockType: number, faceRow: 0 | 1 | 2): [number, number, number, number] {
  const col = BLOCK_ATLAS_COL[blockType] ?? 0;
  const u0 = col / COLS;
  const u1 = (col + 1) / COLS;
  const v1 = 1 - faceRow / ROWS;
  const v0 = 1 - (faceRow + 1) / ROWS;
  return [u0, u1, v0, v1];
}
