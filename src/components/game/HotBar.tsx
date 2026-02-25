import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BLOCK_NAMES } from "@/lib/terrain";
import { getBlockAtlasTexture, getBlockUV, onAtlasUpdate } from "@/lib/textures";

export interface InventorySlot {
  blockType: number | null;
  count: number;
}

export const HOTBAR_SIZE = 9;

export function createEmptyInventory(): InventorySlot[] {
  return Array.from({ length: HOTBAR_SIZE }, () => ({ blockType: null, count: 0 }));
}

export function addToInventory(inventory: InventorySlot[], blockType: number): InventorySlot[] {
  const next = inventory.map(s => ({ ...s }));
  // Find existing stack
  const existing = next.find(s => s.blockType === blockType && s.count > 0);
  if (existing) {
    existing.count++;
    return next;
  }
  // Find empty slot
  const empty = next.find(s => s.blockType === null || s.count === 0);
  if (empty) {
    empty.blockType = blockType;
    empty.count = 1;
  }
  return next;
}

export function removeFromInventory(inventory: InventorySlot[], index: number): InventorySlot[] {
  const next = inventory.map(s => ({ ...s }));
  if (next[index].count > 0) {
    next[index].count--;
    if (next[index].count === 0) {
      next[index].blockType = null;
    }
  }
  return next;
}

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
      style={{ imageRendering: 'auto', display: 'block', width: 15, height: 15, filter: 'saturate(1.45) brightness(1.1)' }}
    />
  );
}

interface HotBarProps {
  inventory: InventorySlot[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpenInventory: () => void;
}

export function HotBar({ inventory, selectedIndex, onSelect, onOpenInventory }: HotBarProps) {
  const slotSize = 48;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    }}>
    <div className="mc-hotbar">
      {inventory.slice(0, 9).map((slot, i) => {
        const isSelected = i === selectedIndex;
        return (
          <div
            key={i}
            className={isSelected ? 'mc-slot mc-slot-selected' : 'mc-slot'}
            style={{ width: slotSize, height: slotSize, cursor: 'pointer', flexShrink: 0 }}
            onPointerDown={() => onSelect(i)}
            title={slot.blockType !== null ? BLOCK_NAMES[slot.blockType] || '' : ''}
          >
            {slot.blockType !== null && slot.count > 0 && (
              <>
                <BlockIcon blockType={slot.blockType} />
                {slot.count > 1 && (
                  <div className="mc-text" style={{
                    position: 'absolute', bottom: 1, right: 3,
                    fontSize: 8, color: '#fff', lineHeight: 1,
                  }}>
                    {slot.count}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
    {/* Inventory open button */}
    <div
      className="mc-hotbar"
      style={{ cursor: 'pointer' }}
      onPointerDown={onOpenInventory}
    >
      <div
        className="mc-slot"
        style={{
          width: slotSize, height: slotSize,
          background: 'rgb(180, 180, 180)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 3 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 6, height: 6, background: '#fff', borderRadius: 1 }} />
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
