import { useState } from "react";
import { InventorySlot, HOTBAR_SIZE } from "./HotBar";
import { BLOCK_NAMES } from "@/lib/terrain";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getBlockAtlasTexture, getBlockUV, onAtlasUpdate } from "@/lib/textures";

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

function SmallBlockIcon({ blockType }: { blockType: number }) {
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
      style={{ imageRendering: 'auto', display: 'block', width: 28, height: 28, filter: 'saturate(1.45) brightness(1.1)' }}
    />
  );
}

export const STORAGE_SIZE = 27;
export const TOTAL_SLOTS = HOTBAR_SIZE + STORAGE_SIZE; // 36

export function createFullInventory(): InventorySlot[] {
  return Array.from({ length: TOTAL_SLOTS }, () => ({ blockType: null, count: 0 }));
}

interface InventoryScreenProps {
  inventory: InventorySlot[]; // 36 slots: 0-8 = hotbar, 9-35 = storage
  onInventoryChange: (inv: InventorySlot[]) => void;
  onClose: () => void;
  selectedHotbarIndex: number;
}

export function InventoryScreen({ inventory, onInventoryChange, onClose, selectedHotbarIndex }: InventoryScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const slotSize = 48;

  const handleSlotClick = (index: number) => {
    if (selectedIndex === null) {
      setSelectedIndex(index);
    } else if (selectedIndex === index) {
      setSelectedIndex(null);
    } else {
      const source = inventory[selectedIndex];
      const target = inventory[index];
      const sourceEmpty = source.blockType === null || source.count <= 0;
      const targetEmpty = target.blockType === null || target.count <= 0;

      if (sourceEmpty && targetEmpty) {
        setSelectedIndex(null);
        return;
      }

      const next = inventory.map(s => ({ ...s }));
      if (source.blockType !== null && source.count > 0 && target.blockType === source.blockType) {
        next[index] = { blockType: target.blockType!, count: target.count + source.count };
        next[selectedIndex] = { blockType: null, count: 0 };
      } else {
        next[selectedIndex] = { blockType: target.blockType, count: target.count };
        next[index] = { blockType: source.blockType, count: source.count };
      }

      onInventoryChange(next);
      setSelectedIndex(null);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const renderSlot = (index: number, isHotbar: boolean = false) => {
    const slot = inventory[index];
    const isSelectedHotbar = false;
    return (
      <div
        key={index}
        className={`mc-slot ${selectedIndex === index ? 'mc-slot-selected' : ''}`}
        style={{
          width: slotSize, height: slotSize, cursor: 'pointer', flexShrink: 0,
        }}
        onPointerDown={() => handleSlotClick(index)}
      >
        {slot.blockType !== null && slot.count > 0 && (
          <>
            <SmallBlockIcon blockType={slot.blockType} />
            {slot.count > 1 && (
              <div className="mc-text" style={{
                position: 'absolute', bottom: 1, right: 3,
                fontSize: 7, color: '#fff', lineHeight: 1,
              }}>
                {slot.count}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: '#c6c6c6',
        border: '4px solid',
        borderColor: '#fff #555 #555 #fff',
        padding: 12,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {/* Crafting area */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div className="mc-text" style={{ fontSize: 8, color: '#404040', marginRight: 'auto' }}>
            Fabrication
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={`craft-${i}`} className="mc-slot" style={{ width: slotSize, height: slotSize, opacity: 0.6 }} />
            ))}
          </div>
          <div style={{ fontSize: 18, color: '#666', margin: '0 4px' }}>→</div>
          <div className="mc-slot" style={{ width: slotSize, height: slotSize, opacity: 0.6 }} />
        </div>

        {/* Separator */}
        <div style={{ height: 2, background: '#888', margin: '6px 0 2px' }} />

        {/* Storage (3 rows of 9) */}
        {[0, 1, 2].map(row => (
          <div key={`storage-${row}`} style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 9 }, (_, col) => renderSlot(HOTBAR_SIZE + row * 9 + col))}
          </div>
        ))}

        {/* Separator */}
        <div style={{ height: 4 }} />

        {/* Hotbar row */}
        <div style={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: HOTBAR_SIZE }, (_, i) => renderSlot(i, true))}
        </div>

      </div>
    </div>
  );
}
