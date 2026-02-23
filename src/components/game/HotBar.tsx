import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BLOCK_NAMES, BLOCK_TYPES } from "@/lib/terrain";
import { getBlockAtlasTexture, getBlockUV, onAtlasUpdate } from "@/lib/textures";

export const HOTBAR_BLOCKS = [
  BLOCK_TYPES.GRASS,
  BLOCK_TYPES.DIRT,
  BLOCK_TYPES.STONE,
  BLOCK_TYPES.WOOD,
  BLOCK_TYPES.SAND,
  BLOCK_TYPES.LEAVES,
];

const ICON_PX = 64;

function renderCubeIcon(canvas: HTMLCanvasElement, blockType: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(ICON_PX, ICON_PX);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(2, 1.8, 2);
  camera.lookAt(0, 0, 0);
  camera.zoom = 0.88;
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
  renderer.dispose();
}

function BlockIcon({ blockType }: { blockType: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => onAtlasUpdate(() => setTick(t => t + 1)), []);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderCubeIcon(canvasRef.current, blockType);
  }, [blockType, tick]);

  return (
    <canvas
      ref={canvasRef}
      width={ICON_PX}
      height={ICON_PX}
      style={{ imageRendering: 'auto', display: 'block', width: 32, height: 32, filter: 'saturate(1.45) brightness(1.1)' }}
    />
  );
}

interface HotBarProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function HotBar({ selectedIndex, onSelect }: HotBarProps) {
  const slotSize = 52;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
    }}>
    <div className="mc-hotbar">
      {HOTBAR_BLOCKS.map((blockType, i) => {
        const isSelected = i === selectedIndex;
        return (
          <div
            key={blockType}
            className={isSelected ? 'mc-slot mc-slot-selected' : 'mc-slot'}
            style={{ width: slotSize, height: slotSize, cursor: 'pointer', flexShrink: 0 }}
            onPointerDown={() => onSelect(i)}
            title={BLOCK_NAMES[blockType]}
          >
            <BlockIcon blockType={blockType} />
            <div className="mc-text" style={{
              position: 'absolute', bottom: 2, right: 4,
              fontSize: 7, color: '#fff', lineHeight: 1,
            }}>
              {i + 1}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
