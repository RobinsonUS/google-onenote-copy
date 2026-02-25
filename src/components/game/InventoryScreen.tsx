import { useState, useMemo, useEffect } from "react";
import { InventorySlot, HOTBAR_SIZE } from "./HotBar";
import { BLOCK_TYPES } from "@/lib/terrain";
import { onAtlasUpdate } from "@/lib/textures";
import { renderBlockIconToDataURL, clearIconCache } from "@/lib/blockIconRenderer";
function SmallBlockIcon({ blockType }: { blockType: number }) {
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
      width={32}
      height={32}
      style={{ imageRendering: 'auto', display: 'block', filter: 'saturate(1.45) brightness(1.1)' }}
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
  const [craftSlots, setCraftSlots] = useState<InventorySlot[]>([
    { blockType: null, count: 0 },
    { blockType: null, count: 0 },
    { blockType: null, count: 0 },
    { blockType: null, count: 0 },
  ]);
  const slotSize = 48;

  // Compute crafting result: exactly 1 slot has wood → 4 planks
  const craftResult: InventorySlot = useMemo(() => {
    const filledSlots = craftSlots.filter(s => s.blockType !== null && s.count > 0);
    if (filledSlots.length === 1 && filledSlots[0].blockType === BLOCK_TYPES.WOOD) {
      return { blockType: BLOCK_TYPES.PLANKS, count: 4 };
    }
    return { blockType: null, count: 0 };
  }, [craftSlots]);

  // Click on the result slot to collect crafted items
  const handleResultClick = () => {
    if (craftResult.blockType === null || craftResult.count <= 0) return;
    // Try to add result to inventory
    const nextInv = inventory.map(s => ({ ...s }));
    let remaining = craftResult.count;
    // Stack into existing
    for (let i = 0; i < nextInv.length && remaining > 0; i++) {
      if (nextInv[i].blockType === craftResult.blockType) {
        nextInv[i] = { blockType: craftResult.blockType, count: nextInv[i].count + remaining };
        remaining = 0;
      }
    }
    // Fill empty slots
    for (let i = 0; i < nextInv.length && remaining > 0; i++) {
      if (nextInv[i].blockType === null || nextInv[i].count <= 0) {
        nextInv[i] = { blockType: craftResult.blockType, count: remaining };
        remaining = 0;
      }
    }
    if (remaining > 0) return; // no space
    // Consume only 1 input item from the craft slot
    const nextCraft = craftSlots.map(s => ({ ...s }));
    for (let i = 0; i < nextCraft.length; i++) {
      if (nextCraft[i].blockType !== null && nextCraft[i].count > 0) {
        nextCraft[i].count -= 1;
        if (nextCraft[i].count <= 0) {
          nextCraft[i] = { blockType: null, count: 0 };
        }
        break;
      }
    }
    setCraftSlots(nextCraft);
    onInventoryChange(nextInv);
    setSelectedIndex(null);
  };

  // Return crafting items to inventory on close
  const handleClose = () => {
    const hasItems = craftSlots.some(s => s.blockType !== null && s.count > 0);
    if (hasItems) {
      const next = inventory.map(s => ({ ...s }));
      for (const cs of craftSlots) {
        if (cs.blockType === null || cs.count <= 0) continue;
        let remaining = cs.count;
        for (let i = 0; i < next.length && remaining > 0; i++) {
          if (next[i].blockType === cs.blockType) {
            next[i] = { blockType: cs.blockType, count: next[i].count + remaining };
            remaining = 0;
          }
        }
        for (let i = 0; i < next.length && remaining > 0; i++) {
          if (next[i].blockType === null || next[i].count <= 0) {
            next[i] = { blockType: cs.blockType, count: remaining };
            remaining = 0;
          }
        }
      }
      onInventoryChange(next);
    }
    onClose();
  };

  const handleCraftSlotClick = (craftIndex: number) => {
    const virtualIndex = TOTAL_SLOTS + craftIndex;
    if (selectedIndex === null) {
      const cs = craftSlots[craftIndex];
      if (cs.blockType !== null && cs.count > 0) {
        setSelectedIndex(virtualIndex);
      }
    } else if (selectedIndex === virtualIndex) {
      setSelectedIndex(null);
    } else {
      const isSourceCraft = selectedIndex >= TOTAL_SLOTS;
      const sourceSlot = isSourceCraft
        ? craftSlots[selectedIndex - TOTAL_SLOTS]
        : inventory[selectedIndex];
      const targetSlot = craftSlots[craftIndex];

      const sourceEmpty = sourceSlot.blockType === null || sourceSlot.count <= 0;
      const targetEmpty = targetSlot.blockType === null || targetSlot.count <= 0;
      if (sourceEmpty && targetEmpty) { setSelectedIndex(null); return; }

      const newSource: InventorySlot = { blockType: targetSlot.blockType, count: targetSlot.count };
      let newTarget: InventorySlot;
      if (sourceSlot.blockType !== null && sourceSlot.count > 0 && targetSlot.blockType === sourceSlot.blockType) {
        newTarget = { blockType: sourceSlot.blockType, count: targetSlot.count + sourceSlot.count };
        newSource.blockType = null; newSource.count = 0;
      } else {
        newTarget = { blockType: sourceSlot.blockType, count: sourceSlot.count };
      }

      const nextCraft = [...craftSlots];
      nextCraft[craftIndex] = newTarget;

      if (isSourceCraft) {
        nextCraft[selectedIndex - TOTAL_SLOTS] = newSource;
        setCraftSlots(nextCraft);
      } else {
        setCraftSlots(nextCraft);
        const nextInv = inventory.map(s => ({ ...s }));
        nextInv[selectedIndex] = newSource;
        onInventoryChange(nextInv);
      }
      setSelectedIndex(null);
    }
  };

  const handleSlotClick = (index: number) => {
    if (selectedIndex === null) {
      setSelectedIndex(index);
    } else if (selectedIndex === index) {
      setSelectedIndex(null);
    } else {
      // Source is a craft slot
      const isSourceCraft = selectedIndex >= TOTAL_SLOTS;
      const isTargetCraft = false; // regular inventory slots handled here
      
      if (isSourceCraft) {
        const sourceSlot = craftSlots[selectedIndex - TOTAL_SLOTS];
        const targetSlot = inventory[index];
        const sourceEmpty = sourceSlot.blockType === null || sourceSlot.count <= 0;
        const targetEmpty = targetSlot.blockType === null || targetSlot.count <= 0;
        if (sourceEmpty && targetEmpty) { setSelectedIndex(null); return; }

        const nextInv = inventory.map(s => ({ ...s }));
        const nextCraft = [...craftSlots];
        if (sourceSlot.blockType !== null && sourceSlot.count > 0 && targetSlot.blockType === sourceSlot.blockType) {
          nextInv[index] = { blockType: targetSlot.blockType, count: targetSlot.count + sourceSlot.count };
          nextCraft[selectedIndex - TOTAL_SLOTS] = { blockType: null, count: 0 };
        } else {
          nextInv[index] = { blockType: sourceSlot.blockType, count: sourceSlot.count };
          nextCraft[selectedIndex - TOTAL_SLOTS] = { blockType: targetSlot.blockType, count: targetSlot.count };
        }
        onInventoryChange(nextInv);
        setCraftSlots(nextCraft);
        setSelectedIndex(null);
        return;
      }

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

  const renderSlot = (index: number, isHotbar: boolean = false) => {
    const slot = inventory[index];
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

  const renderCraftSlot = (craftIndex: number) => {
    const slot = craftSlots[craftIndex];
    const virtualIndex = TOTAL_SLOTS + craftIndex;
    return (
      <div
        key={`craft-${craftIndex}`}
        className={`mc-slot ${selectedIndex === virtualIndex ? 'mc-slot-selected' : ''}`}
        style={{ width: slotSize, height: slotSize, cursor: 'pointer' }}
        onPointerDown={() => handleCraftSlotClick(craftIndex)}
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
        {/* Crafting area - centered */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8, minHeight: 110 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {[0, 1, 2, 3].map(i => renderCraftSlot(i))}
          </div>
          <div style={{ fontSize: 22, color: '#888', fontWeight: 'bold', lineHeight: 1 }}>➜</div>
          <div
            className="mc-slot"
            style={{ width: slotSize, height: slotSize, cursor: craftResult.blockType !== null ? 'pointer' : 'default' }}
            onPointerDown={handleResultClick}
          >
            {craftResult.blockType !== null && craftResult.count > 0 && (
              <>
                <SmallBlockIcon blockType={craftResult.blockType} />
                {craftResult.count > 1 && (
                  <div className="mc-text" style={{
                    position: 'absolute', bottom: 1, right: 3,
                    fontSize: 7, color: '#fff', lineHeight: 1,
                  }}>
                    {craftResult.count}
                  </div>
                )}
              </>
            )}
          </div>
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
