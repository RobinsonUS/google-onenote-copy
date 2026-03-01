import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { InventorySlot, HOTBAR_SIZE, MAX_STACK } from "./HotBar";
import { BLOCK_TYPES, isItem, ITEM_TYPES } from "@/lib/terrain";
import { onAtlasUpdate } from "@/lib/textures";
import { renderBlockIconToDataURL, clearIconCache } from "@/lib/blockIconRenderer";
// Map item IDs to their texture paths
const ITEM_TEXTURES: Record<number, string> = {
  [ITEM_TYPES.STICK]: '/textures/stick.webp',
  [ITEM_TYPES.WOODEN_AXE]: '/textures/wooden_axe.png',
};

function SmallBlockIcon({ blockType }: { blockType: number }) {
  const [src, setSrc] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => onAtlasUpdate(() => { clearIconCache(); setTick(t => t + 1); }), []);
  useEffect(() => {
    if (isItem(blockType)) {
      setSrc(ITEM_TEXTURES[blockType] || '');
    } else {
      setSrc(renderBlockIconToDataURL(blockType));
    }
  }, [blockType, tick]);
  if (!src) return null;
   return (
    <img
      src={src}
      width={40}
      height={40}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      style={{ imageRendering: 'auto', display: 'block', filter: isItem(blockType) ? 'none' : 'saturate(1.45) brightness(1.1)', userSelect: 'none', WebkitTouchCallout: 'none', pointerEvents: 'none', mixBlendMode: isItem(blockType) ? 'multiply' : undefined }}
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
  const [splitState, setSplitState] = useState<{ index: number; blockType: number; total: number; selected: number } | null>(null);
  const [heldItems, setHeldItems] = useState<InventorySlot>({ blockType: null, count: 0 });
  const [isSplitPick, setIsSplitPick] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartX = useRef(0);
  const isSplitting = useRef(false);
  const [craftSlots, setCraftSlots] = useState<InventorySlot[]>([
    { blockType: null, count: 0 },
    { blockType: null, count: 0 },
    { blockType: null, count: 0 },
    { blockType: null, count: 0 },
  ]);
  const slotSize = 48;

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleSplitPointerDown = (index: number, e: React.PointerEvent) => {
    const slot = index >= TOTAL_SLOTS ? craftSlots[index - TOTAL_SLOTS] : inventory[index];
    if (slot.blockType === null || slot.count <= 1) return;
    if (selectedIndex !== null || heldItems.blockType !== null) return;

    longPressStartX.current = e.clientX;
    isSplitting.current = false;

    longPressTimer.current = setTimeout(() => {
      isSplitting.current = true;
      const half = Math.ceil(slot.count / 2);
      setSplitState({ index, blockType: slot.blockType!, total: slot.count, selected: half });
    }, 400);
  };

  const handleSplitPointerMove = (e: React.PointerEvent) => {
    if (!splitState) {
      // If moving before long press triggers, cancel it
      if (longPressTimer.current && Math.abs(e.clientX - longPressStartX.current) > 10) {
        cancelLongPress();
      }
      return;
    }
    const dx = e.clientX - longPressStartX.current;
    const range = 120; // pixels for full range
    const ratio = Math.max(0, Math.min(1, 0.5 + dx / range));
    const selected = Math.max(1, Math.min(splitState.total, Math.round(ratio * splitState.total)));
    setSplitState(prev => prev ? { ...prev, selected } : null);
  };

  const handleSplitPointerUp = () => {
    cancelLongPress();
    if (splitState) {
      // Pick up the selected portion, leave the rest
      const { index, blockType, total, selected } = splitState;
      const remaining = total - selected;
      
      if (index >= TOTAL_SLOTS) {
        const ci = index - TOTAL_SLOTS;
        const nextCraft = [...craftSlots];
        nextCraft[ci] = remaining > 0 ? { blockType, count: remaining } : { blockType: null, count: 0 };
        setCraftSlots(nextCraft);
      } else {
        const nextInv = inventory.map(s => ({ ...s }));
        nextInv[index] = remaining > 0 ? { blockType, count: remaining } : { blockType: null, count: 0 };
        onInventoryChange(nextInv);
      }
      setHeldItems({ blockType, count: selected });
      setIsSplitPick(true);
      setSelectedIndex(index);
      setSplitState(null);
      isSplitting.current = false;
      return;
    }
  };

  // Compute crafting result
  const craftResult: InventorySlot = useMemo(() => {
    const filledSlots = craftSlots.filter(s => s.blockType !== null && s.count > 0);
    const slots = craftSlots.map(s => s.blockType);
    // Wood → 4 planks (single wood in any slot)
    if (filledSlots.length === 1 && filledSlots[0].blockType === BLOCK_TYPES.WOOD) {
      return { blockType: BLOCK_TYPES.PLANKS, count: 4 };
    }
    // Stick: 2 planks vertically (slots [0,2] or [1,3])
    if (filledSlots.length === 2 && filledSlots.every(s => s.blockType === BLOCK_TYPES.PLANKS)) {
      if ((slots[0] === BLOCK_TYPES.PLANKS && slots[1] === null && slots[2] === BLOCK_TYPES.PLANKS && slots[3] === null) ||
          (slots[0] === null && slots[1] === BLOCK_TYPES.PLANKS && slots[2] === null && slots[3] === BLOCK_TYPES.PLANKS)) {
        return { blockType: ITEM_TYPES.STICK, count: 4 };
      }
    }
    // Crafting table: 4 planks (all slots filled with planks)
    if (filledSlots.length === 4 && filledSlots.every(s => s.blockType === BLOCK_TYPES.PLANKS)) {
      return { blockType: BLOCK_TYPES.CRAFTING_TABLE, count: 1 };
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
      if (nextInv[i].blockType === craftResult.blockType && nextInv[i].count < MAX_STACK) {
        const canAdd = Math.min(remaining, MAX_STACK - nextInv[i].count);
        nextInv[i] = { blockType: craftResult.blockType, count: nextInv[i].count + canAdd };
        remaining -= canAdd;
      }
    }
    // Fill empty slots
    for (let i = 0; i < nextInv.length && remaining > 0; i++) {
      if (nextInv[i].blockType === null || nextInv[i].count <= 0) {
        const canAdd = Math.min(remaining, MAX_STACK);
        nextInv[i] = { blockType: craftResult.blockType, count: canAdd };
        remaining -= canAdd;
      }
    }
    if (remaining > 0) return; // no space
    // Consume 1 input item from each filled craft slot
    const nextCraft = craftSlots.map(s => ({ ...s }));
    for (let i = 0; i < nextCraft.length; i++) {
      if (nextCraft[i].blockType !== null && nextCraft[i].count > 0) {
        nextCraft[i].count -= 1;
        if (nextCraft[i].count <= 0) {
          nextCraft[i] = { blockType: null, count: 0 };
        }
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
          if (next[i].blockType === cs.blockType && next[i].count < MAX_STACK) {
            const canAdd = Math.min(remaining, MAX_STACK - next[i].count);
            next[i] = { blockType: cs.blockType, count: next[i].count + canAdd };
            remaining -= canAdd;
          }
        }
        for (let i = 0; i < next.length && remaining > 0; i++) {
          if (next[i].blockType === null || next[i].count <= 0) {
            const canAdd = Math.min(remaining, MAX_STACK);
            next[i] = { blockType: cs.blockType, count: canAdd };
            remaining -= canAdd;
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
        setHeldItems({ blockType: cs.blockType, count: cs.count });
        setSelectedIndex(virtualIndex);
        setIsSplitPick(false);
      }
    } else if (selectedIndex === virtualIndex) {
      // Put back held items into craft slot
      if (heldItems.blockType !== null && heldItems.count > 0) {
        const nextCraft = [...craftSlots];
        nextCraft[craftIndex] = { blockType: heldItems.blockType, count: heldItems.count };
        setCraftSlots(nextCraft);
      }
      setSelectedIndex(null);
      setHeldItems({ blockType: null, count: 0 });
    } else {
      const isSourceCraft = selectedIndex >= TOTAL_SLOTS;
      // Use heldItems as the source (items are already picked up)
      const sourceSlot = heldItems.blockType !== null ? heldItems : (isSourceCraft
        ? craftSlots[selectedIndex - TOTAL_SLOTS]
        : inventory[selectedIndex]);
      const targetSlot = craftSlots[craftIndex];

      const sourceEmpty = sourceSlot.blockType === null || sourceSlot.count <= 0;
      const targetEmpty = targetSlot.blockType === null || targetSlot.count <= 0;
      if (sourceEmpty && targetEmpty) { setSelectedIndex(null); setHeldItems({ blockType: null, count: 0 }); return; }

      let newSource: InventorySlot = { blockType: targetSlot.blockType, count: targetSlot.count };
      let newTarget: InventorySlot;
      if (sourceSlot.blockType !== null && sourceSlot.count > 0 && targetSlot.blockType === sourceSlot.blockType) {
        const total = targetSlot.count + sourceSlot.count;
        if (total <= MAX_STACK) {
          newTarget = { blockType: sourceSlot.blockType, count: total };
          newSource.blockType = null; newSource.count = 0;
        } else {
          newTarget = { blockType: sourceSlot.blockType, count: MAX_STACK };
          newSource = { blockType: sourceSlot.blockType, count: total - MAX_STACK };
        }
      } else {
        newTarget = { blockType: sourceSlot.blockType, count: sourceSlot.count };
      }

      const nextCraft = [...craftSlots];
      nextCraft[craftIndex] = newTarget;

      if (isSourceCraft) {
        // Clear the source craft slot, put swap back if needed
        const srcCraftIdx = selectedIndex - TOTAL_SLOTS;
        nextCraft[srcCraftIdx] = newSource.blockType !== null && newSource.count > 0
          ? newSource
          : { blockType: null, count: 0 };
        setCraftSlots(nextCraft);
      } else {
        setCraftSlots(nextCraft);
        // Only update inventory source if not a split pick (remainder already there)
        if (!isSplitPick) {
          const nextInv = inventory.map(s => ({ ...s }));
          nextInv[selectedIndex] = newSource;
          onInventoryChange(nextInv);
        } else if (newSource.blockType !== null && newSource.count > 0) {
          // Split pick with leftover: add back to inventory source
          const nextInv = inventory.map(s => ({ ...s }));
          const existing = nextInv[selectedIndex];
          if (existing.blockType === newSource.blockType) {
            nextInv[selectedIndex] = { blockType: newSource.blockType, count: existing.count + newSource.count };
          } else if (existing.blockType === null || existing.count <= 0) {
            nextInv[selectedIndex] = newSource;
          }
          onInventoryChange(nextInv);
        }
      }
      setSelectedIndex(null);
      setHeldItems({ blockType: null, count: 0 });
    }
  };

  const handleSlotClick = (index: number) => {
    if (isSplitting.current || splitState) return;
    
    if (selectedIndex === null) {
      const slot = inventory[index];
      if (slot.blockType === null || slot.count <= 0) return;
      setSelectedIndex(index);
      setHeldItems({ blockType: slot.blockType, count: slot.count });
      setIsSplitPick(false);
    } else if (selectedIndex === index) {
      // Deselect - items are already in slot (never cleared on pick), just reset state
      setSelectedIndex(null);
      setHeldItems({ blockType: null, count: 0 });
    } else {
      // Source is a craft slot
      const isSourceCraft = selectedIndex >= TOTAL_SLOTS;
      
      if (isSourceCraft) {
        const sourceSlot = heldItems.blockType !== null ? heldItems : craftSlots[selectedIndex - TOTAL_SLOTS];
        const targetSlot = inventory[index];
        const sourceEmpty = sourceSlot.blockType === null || sourceSlot.count <= 0;
        const targetEmpty = targetSlot.blockType === null || targetSlot.count <= 0;
        if (sourceEmpty && targetEmpty) { setSelectedIndex(null); setHeldItems({ blockType: null, count: 0 }); return; }

        const nextInv = inventory.map(s => ({ ...s }));
        const ci = selectedIndex - TOTAL_SLOTS;
        const nextCraft = [...craftSlots];
        if (sourceSlot.blockType !== null && sourceSlot.count > 0 && targetSlot.blockType === sourceSlot.blockType) {
          const total = targetSlot.count + sourceSlot.count;
          if (total <= MAX_STACK) {
            nextInv[index] = { blockType: targetSlot.blockType, count: total };
            nextCraft[ci] = { blockType: null, count: 0 };
          } else {
            nextInv[index] = { blockType: targetSlot.blockType, count: MAX_STACK };
            nextCraft[ci] = { blockType: sourceSlot.blockType, count: total - MAX_STACK };
          }
        } else {
          nextInv[index] = { blockType: sourceSlot.blockType, count: sourceSlot.count };
          if (!targetEmpty) {
            nextCraft[ci] = { blockType: targetSlot.blockType, count: targetSlot.count };
          } else {
            nextCraft[ci] = { blockType: null, count: 0 };
          }
        }
        setCraftSlots(nextCraft);
        onInventoryChange(nextInv);
        setSelectedIndex(null);
        setHeldItems({ blockType: null, count: 0 });
        return;
      }

      const source = heldItems.blockType !== null ? heldItems : inventory[selectedIndex];
      const target = inventory[index];
      const sourceEmpty = source.blockType === null || source.count <= 0;
      const targetEmpty = target.blockType === null || target.count <= 0;

      if (sourceEmpty && targetEmpty) {
        setSelectedIndex(null);
        setHeldItems({ blockType: null, count: 0 });
        return;
      }

      const next = inventory.map(s => ({ ...s }));
      const splitMove = isSplitPick;

      if (source.blockType !== null && source.count > 0 && target.blockType === source.blockType) {
        const total = target.count + source.count;
        if (total <= MAX_STACK) {
          next[index] = { blockType: target.blockType!, count: total };
          if (!splitMove) {
            next[selectedIndex] = { blockType: null, count: 0 };
          }
        } else {
          next[index] = { blockType: target.blockType!, count: MAX_STACK };
          const leftover = total - MAX_STACK;
          if (splitMove) {
            // Add leftover back to source slot
            const existing = next[selectedIndex];
            if (existing.blockType === source.blockType) {
              next[selectedIndex] = { blockType: source.blockType, count: existing.count + leftover };
            } else {
              next[selectedIndex] = { blockType: source.blockType, count: leftover };
            }
          } else {
            next[selectedIndex] = { blockType: source.blockType, count: leftover };
          }
        }
      } else if (splitMove) {
        // Split move to empty or different-type slot: just place held items, don't touch source
        if (targetEmpty) {
          next[index] = { blockType: source.blockType, count: source.count };
        } else {
          // Target has different type - swap target into a free slot or back to source
          next[index] = { blockType: source.blockType, count: source.count };
          // Put displaced target items back to source if source has space
          const srcSlot = next[selectedIndex];
          if (srcSlot.blockType === null || srcSlot.count <= 0) {
            next[selectedIndex] = { blockType: target.blockType, count: target.count };
          } else if (srcSlot.blockType === target.blockType && srcSlot.count + target.count <= MAX_STACK) {
            next[selectedIndex] = { blockType: target.blockType, count: srcSlot.count + target.count };
          } else {
            // Find another empty slot
            let placed = false;
            for (let i = 0; i < next.length; i++) {
              if ((next[i].blockType === null || next[i].count <= 0) && i !== index) {
                next[i] = { blockType: target.blockType, count: target.count };
                placed = true;
                break;
              }
            }
            if (!placed) return; // no space, abort
          }
        }
      } else {
        next[selectedIndex] = { blockType: target.blockType, count: target.count };
        next[index] = { blockType: source.blockType, count: source.count };
      }

      onInventoryChange(next);
      setSelectedIndex(null);
      setHeldItems({ blockType: null, count: 0 });
    }
  };

  const renderSlot = (index: number, isHotbar: boolean = false) => {
    const slot = inventory[index];
    const isSplitTarget = splitState?.index === index;
    const displayCount = isSplitTarget ? (slot.count - splitState.selected) : slot.count;
    return (
      <div
        key={index}
        className={`mc-slot ${selectedIndex === index ? 'mc-slot-selected' : ''}`}
        style={{
          width: slotSize, height: slotSize, cursor: 'pointer', flexShrink: 0,
        }}
        onPointerDown={(e) => {
          handleSplitPointerDown(index, e);
        }}
        onPointerMove={handleSplitPointerMove}
        onPointerUp={() => {
          if (!isSplitting.current && !splitState) {
            cancelLongPress();
            handleSlotClick(index);
          } else {
            handleSplitPointerUp();
          }
        }}
        onPointerLeave={() => {
          if (splitState) handleSplitPointerUp();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {slot.blockType !== null && slot.count > 0 && (
          <>
            <SmallBlockIcon blockType={slot.blockType} />
            {displayCount > 1 && (
              <div className="mc-text" style={{
                position: 'absolute', bottom: 1, right: 3,
                fontSize: 7, color: '#fff', lineHeight: 1,
              }}>
                {isSplitTarget ? displayCount : slot.count}
              </div>
            )}
          </>
        )}
        {isSplitTarget && (
          <div style={{
            position: 'absolute', top: -18, left: -4, right: -4,
            height: 14, background: '#555', borderRadius: 3, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${(splitState.selected / splitState.total) * 100}%`,
              background: '#4caf50', borderRadius: 3,
              transition: 'width 0.05s',
            }} />
            <span style={{
              position: 'relative', zIndex: 1,
              fontSize: 9, color: '#fff', fontFamily: 'monospace', fontWeight: 'bold',
              textShadow: 'none', lineHeight: 1,
            }}>
              {splitState.selected}/{splitState.total}
            </span>
          </div>
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
        onContextMenu={(e) => e.preventDefault()}
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
      onPointerMove={handleSplitPointerMove}
      onPointerUp={() => { if (splitState) handleSplitPointerUp(); }}
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
