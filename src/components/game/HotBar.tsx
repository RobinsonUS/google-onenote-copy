import { useEffect, useState } from "react";
import { BLOCK_NAMES } from "@/lib/terrain";
import { onAtlasUpdate } from "@/lib/textures";
import { renderBlockIconToDataURL, clearIconCache } from "@/lib/blockIconRenderer";

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

function BlockIcon({ blockType }: { blockType: number }) {
  const [src, setSrc] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => onAtlasUpdate(() => { clearIconCache(); setTick(t => t + 1); }), []);

  useEffect(() => {
    setSrc(renderBlockIconToDataURL(blockType));
  }, [blockType, tick]);

  if (!src) return null;
  return (
    <img
      src={src}
      width={24}
      height={24}
      style={{ imageRendering: 'auto', display: 'block', filter: 'saturate(1.45) brightness(1.1)' }}
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
