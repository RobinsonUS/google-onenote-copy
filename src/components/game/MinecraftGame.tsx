import { useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";
import { generateTerrain, WorldData, BLOCK_TYPES, posKey, BlockType } from "@/lib/terrain";
import { VoxelChunk } from "./VoxelChunk";
import { TouchJoystick } from "./TouchJoystick";
import { HotBar, HOTBAR_BLOCKS } from "./HotBar";
import { BlockParticles, useBlockParticles } from "./BlockParticles";

// ─── Swept AABB collision helpers ─────────────────────────────────────────────

const EYE  = 1.62;
const HALF = 0.3;
const HEAD = 0.18;
const PLAYER_HEIGHT = EYE + HEAD;

function isSolid(world: WorldData, x: number, y: number, z: number): boolean {
  const bt = world.get(posKey(x, y, z));
  return bt !== undefined && bt !== BLOCK_TYPES.AIR && bt !== BLOCK_TYPES.WATER;
}

// Check if AABB at given position overlaps any solid block
function aabbOverlaps(px: number, feetY: number, pz: number, world: WorldData): boolean {
  const x0 = Math.floor(px - HALF);
  const x1 = Math.floor(px + HALF);
  const z0 = Math.floor(pz - HALF);
  const z1 = Math.floor(pz + HALF);
  const y0 = Math.floor(feetY);
  const y1 = Math.floor(feetY + PLAYER_HEIGHT - 0.01);
  for (let bx = x0; bx <= x1; bx++)
    for (let bz = z0; bz <= z1; bz++)
      for (let by = y0; by <= y1; by++)
        if (isSolid(world, bx, by, bz)) return true;
  return false;
}

// Resolve Y axis: find the highest ground below feet or push out if inside block
// Check if feet are supported (solid block directly below any corner)
function isOnGround(px: number, feetY: number, pz: number, world: WorldData): boolean {
  const by = Math.floor(feetY - 0.001);
  // Check if feetY is near the top of a block and that block is solid
  const topOfBlock = by + 1;
  if (Math.abs(feetY - topOfBlock) > 0.01) return false;
  return (
    isSolid(world, Math.floor(px - HALF), by, Math.floor(pz - HALF)) ||
    isSolid(world, Math.floor(px + HALF), by, Math.floor(pz - HALF)) ||
    isSolid(world, Math.floor(px - HALF), by, Math.floor(pz + HALF)) ||
    isSolid(world, Math.floor(px + HALF), by, Math.floor(pz + HALF))
  );
}

function moveY(px: number, feetY: number, pz: number, dy: number, velY: number, world: WorldData): { feetY: number; velY: number; onGround: boolean } {
  // If already on ground and not jumping, stay put
  if (dy <= 0 && isOnGround(px, feetY, pz, world) && velY <= 0) {
    return { feetY, velY: 0, onGround: true };
  }

  const newFeetY = feetY + dy;
  
  if (!aabbOverlaps(px, newFeetY, pz, world)) {
    if (dy <= 0) {
      // Check if we passed through a block top (snap landing)
      const startBlock = Math.floor(feetY);
      const endBlock = Math.floor(newFeetY);
      for (let by = startBlock; by >= endBlock; by--) {
        const blockTop = by;
        if (blockTop <= feetY && blockTop >= newFeetY) {
          const belowBlock = by - 1;
          if (
            isSolid(world, Math.floor(px - HALF), belowBlock, Math.floor(pz - HALF)) ||
            isSolid(world, Math.floor(px + HALF), belowBlock, Math.floor(pz - HALF)) ||
            isSolid(world, Math.floor(px - HALF), belowBlock, Math.floor(pz + HALF)) ||
            isSolid(world, Math.floor(px + HALF), belowBlock, Math.floor(pz + HALF))
          ) {
            if (!aabbOverlaps(px, blockTop, pz, world)) {
              return { feetY: blockTop, velY: 0, onGround: true };
            }
          }
        }
      }
    }
    return { feetY: newFeetY, velY, onGround: false };
  }
  
  // Collision — binary search for exact contact point with more iterations for precision
  let lo = 0, hi = Math.abs(dy);
  const sign = dy > 0 ? 1 : -1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (aabbOverlaps(px, feetY + sign * mid, pz, world)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  const safeFeetY = feetY + sign * lo;
  
  if (dy <= 0) {
    // Snap to integer block top for stability
    const snapped = Math.ceil(safeFeetY - 0.001);
    if (!aabbOverlaps(px, snapped, pz, world)) {
      return { feetY: snapped, velY: 0, onGround: true };
    }
    return { feetY: safeFeetY, velY: 0, onGround: true };
  } else {
    // Head hit ceiling — zero velocity immediately
    return { feetY: safeFeetY, velY: 0, onGround: false };
  }
}

// ─── Camera Controller ────────────────────────────────────────────────────────

interface CamState {
  yaw: number;
  pitch: number;
}

function CameraController({
  moveRef, camRef, worldRef, onCamPos, cameraRef,
}: {
  moveRef: React.MutableRefObject<{ dx: number; dz: number }>;
  camRef: React.MutableRefObject<CamState>;
  worldRef: React.MutableRefObject<WorldData>;
  onCamPos: (pos: THREE.Vector3) => void;
  cameraRef: React.MutableRefObject<THREE.Camera | null>;
}) {
  const { camera } = useThree();
  const posRef   = useRef(new THREE.Vector3(0, 40, 0));
  const velY     = useRef(0);
  const onGround = useRef(false);
  // Pre-allocated vectors to avoid GC pressure
  const _lookDir = useRef(new THREE.Vector3());
  const _lookTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.copy(posRef.current);
    cameraRef.current = camera;
    const onJump = () => {
      if (onGround.current) { velY.current = 9.5; onGround.current = false; }
    };
    window.addEventListener('mc-jump', onJump);
    return () => window.removeEventListener('mc-jump', onJump);
  }, [camera, cameraRef]);

  useFrame((_, delta) => {
    const dt    = Math.min(delta, 0.05);
    const world = worldRef.current;
    const { dx, dz } = moveRef.current;
    const { yaw, pitch } = camRef.current;
    const speed = 4.5;

    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    // Compute move direction inline (no Vector3 allocation)
    let moveX = -dz * sinYaw + dx * cosYaw;
    let moveZ = -dz * cosYaw + dx * -sinYaw;
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 1) { moveX /= len; moveZ /= len; }

    const pos = posRef.current;

    // Apply gravity FIRST so XZ collision checks use the correct Y
    // Clamp dt to avoid large velocity spikes after lag frames
    velY.current = Math.max(velY.current - 28 * dt, -20);
    const gravDy = velY.current * dt;
    let feetY = pos.y - EYE;
    const resolved = moveY(pos.x, feetY, pos.z, gravDy, velY.current, world);
    feetY = resolved.feetY;
    velY.current = resolved.velY;
    onGround.current = resolved.onGround;

    // Move X (at resolved Y)
    const newX = pos.x + moveX * speed * dt;
    if (!aabbOverlaps(newX, feetY, pos.z, world)) {
      pos.x = newX;
    }

    // Move Z (at resolved Y)
    const newZ = pos.z + moveZ * speed * dt;
    if (!aabbOverlaps(pos.x, feetY, newZ, world)) {
      pos.z = newZ;
    }

    pos.y = feetY + EYE;

    onCamPos(pos);
    camera.position.copy(pos);
    const ld = _lookDir.current;
    ld.set(sinYaw * Math.cos(pitch), Math.sin(pitch), cosYaw * Math.cos(pitch));
    const lt = _lookTarget.current;
    lt.copy(pos).add(ld);
    camera.lookAt(lt);
  });

  return null;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ world, worldVersion, onBlockClick, particleEventsRef }: {
  world: WorldData;
  worldVersion: number;
  onBlockClick: (x:number,y:number,z:number,normal:THREE.Vector3) => void;
  particleEventsRef: React.MutableRefObject<Array<{x:number;y:number;z:number;blockType:number}>>;
}) {
  return (
    <>
      <Sky sunPosition={[100, 80, 20]} turbidity={6} rayleigh={0.5} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[30, 50, 20]} intensity={0.9} castShadow={false} />
      <VoxelChunk world={world} version={worldVersion} onBlockClick={onBlockClick} />
      <BlockParticles eventsRef={particleEventsRef} />
    </>
  );
}

// ─── Raycast helpers ──────────────────────────────────────────────────────────

function screenRaycast(
  screenX: number, screenY: number,
  camera: THREE.Camera, world: WorldData, maxDist = 6,
) {
  const ndc = new THREE.Vector2(
    (screenX / window.innerWidth) * 2 - 1,
    -(screenY / window.innerHeight) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera as THREE.PerspectiveCamera);
  const origin = raycaster.ray.origin;
  const dir = raycaster.ray.direction;

  let prevBx = Math.floor(origin.x);
  let prevBy = Math.floor(origin.y);
  let prevBz = Math.floor(origin.z);
  for (let t = 0.3; t < maxDist; t += 0.04) {
    const p = origin.clone().addScaledVector(dir, t);
    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const bz = Math.floor(p.z);
    const bt = world.get(posKey(bx, by, bz));
    if (bt !== undefined && bt !== BLOCK_TYPES.AIR && bt !== BLOCK_TYPES.WATER) {
      return { hit: true, x: bx, y: by, z: bz, placeX: prevBx, placeY: prevBy, placeZ: prevBz, blockType: bt };
    }
    prevBx = bx; prevBy = by; prevBz = bz;
  }
  return null;
}

function raycastBlock(
  origin: THREE.Vector3, yaw: number, pitch: number,
  world: WorldData, maxDist = 6,
) {
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).normalize();

  let prevBx = Math.floor(origin.x);
  let prevBy = Math.floor(origin.y);
  let prevBz = Math.floor(origin.z);
  for (let t = 0.3; t < maxDist; t += 0.04) {
    const p = origin.clone().addScaledVector(dir, t);
    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const bz = Math.floor(p.z);
    const bt = world.get(posKey(bx, by, bz));
    if (bt !== undefined && bt !== BLOCK_TYPES.AIR && bt !== BLOCK_TYPES.WATER) {
      return { hit: true, x: bx, y: by, z: bz, placeX: prevBx, placeY: prevBy, placeZ: prevBz, blockType: bt };
    }
    prevBx = bx; prevBy = by; prevBz = bz;
  }
  return null;
}

// ─── Player AABB helper ───────────────────────────────────────────────────────

function blockOverlapsPlayer(
  bx: number, by: number, bz: number,
  playerPos: THREE.Vector3,
) {
  const feetY = playerPos.y - EYE;
  const headY = playerPos.y + HEAD;
  return (
    playerPos.x + HALF > bx && playerPos.x - HALF < bx + 1 &&
    headY > by && feetY < by + 1 &&
    playerPos.z + HALF > bz && playerPos.z - HALF < bz + 1
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────

export function MinecraftGame() {
  const worldRef  = useRef<WorldData>(generateTerrain(20));
  const [worldVersion, setWorldVersion] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const moveRef   = useRef({ dx: 0, dz: 0 });
  const camRef    = useRef<CamState>({ yaw: 0, pitch: 0 });
  const camPosRef = useRef(new THREE.Vector3(2, 30, 2));
  const cameraRef = useRef<THREE.Camera | null>(null);

  // Particles
  const { particlesRef: particleEventsRef, emit: emitParticles } = useBlockParticles();

  // Touch look state
  const lookTouchRef = useRef<{
    id: number; startX: number; startY: number;
    startYaw: number; startPitch: number;
    startTime: number;
  } | null>(null);

  // Long-press continuous break state
  const breakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef  = useRef(false);
  const holdTouchPosRef = useRef({ x: 0, y: 0 });
  const hasFirstBrokenRef = useRef(false);
  

  const onCamPos = useCallback((pos: THREE.Vector3) => {
    camPosRef.current.copy(pos);
  }, []);

  // Mutate world directly, bump version to trigger mesh rebuild
  const mutateWorld = useCallback((fn: (w: WorldData) => void) => {
    fn(worldRef.current);
    setWorldVersion(v => v + 1);
  }, []);

  // Break block with particles
  const breakBlock = useCallback((screenX?: number, screenY?: number) => {
    let result: ReturnType<typeof screenRaycast> = null;
    if (screenX !== undefined && screenY !== undefined && cameraRef.current) {
      result = screenRaycast(screenX, screenY, cameraRef.current, worldRef.current);
    } else {
      result = raycastBlock(camPosRef.current, camRef.current.yaw, camRef.current.pitch, worldRef.current);
    }
    if (result?.hit) {
      emitParticles(result.x, result.y, result.z, result.blockType);
      mutateWorld(w => w.delete(posKey(result.x, result.y, result.z)));
    }
  }, [emitParticles, mutateWorld]);

  // Place block
  const placeBlock = useCallback((screenX?: number, screenY?: number) => {
    const selectedBlock = HOTBAR_BLOCKS[selectedIndex];
    if (!selectedBlock) return;

    let result: ReturnType<typeof screenRaycast> = null;
    if (screenX !== undefined && screenY !== undefined && cameraRef.current) {
      result = screenRaycast(screenX, screenY, cameraRef.current, worldRef.current);
    } else {
      result = raycastBlock(camPosRef.current, camRef.current.yaw, camRef.current.pitch, worldRef.current);
    }

    if (result?.hit) {
      const { placeX, placeY, placeZ } = result;
      if (blockOverlapsPlayer(placeX, placeY, placeZ, camPosRef.current)) return;
      const key = posKey(placeX, placeY, placeZ);
      if (!worldRef.current.has(key)) {
        mutateWorld(w => w.set(key, selectedBlock as BlockType));
      }
    }
  }, [selectedIndex, mutateWorld]);

  // Clear break timers
  const clearBreakInterval = useCallback(() => {
    if (breakDelayRef.current) {
      clearTimeout(breakDelayRef.current);
      breakDelayRef.current = null;
    }
    if (breakIntervalRef.current) {
      clearInterval(breakIntervalRef.current);
      breakIntervalRef.current = null;
    }
  }, []);

  // Touch look handlers
  const handleLookTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX > window.innerWidth * 0.35 && lookTouchRef.current === null) {
        lookTouchRef.current = {
          id: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          startYaw: camRef.current.yaw,
          startPitch: camRef.current.pitch,
          startTime: Date.now(),
        };
        holdTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
        isHoldingRef.current = true;

        // 1s delay before first break, then continuous 300ms
        hasFirstBrokenRef.current = false;
        clearBreakInterval();
        breakDelayRef.current = setTimeout(() => {
          if (!isHoldingRef.current) return;
          hasFirstBrokenRef.current = true;
          breakBlock(holdTouchPosRef.current.x, holdTouchPosRef.current.y);
          breakIntervalRef.current = setInterval(() => {
            if (isHoldingRef.current) {
              breakBlock(holdTouchPosRef.current.x, holdTouchPosRef.current.y);
            }
          }, 300);
        }, 400);
      }
    }
  }, [breakBlock, clearBreakInterval]);

  // Reset the 1s delay when camera moves (before first break)
  const resetBreakDelay = useCallback(() => {
    if (!isHoldingRef.current || hasFirstBrokenRef.current) return;
    // Cancel current delay and restart it
    if (breakDelayRef.current) {
      clearTimeout(breakDelayRef.current);
      breakDelayRef.current = setTimeout(() => {
        if (!isHoldingRef.current) return;
        hasFirstBrokenRef.current = true;
        breakBlock(holdTouchPosRef.current.x, holdTouchPosRef.current.y);
        breakIntervalRef.current = setInterval(() => {
          if (isHoldingRef.current) {
            breakBlock(holdTouchPosRef.current.x, holdTouchPosRef.current.y);
          }
        }, 300);
      }, 400);
    }
  }, [breakBlock]);

  const handleLookTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (lookTouchRef.current && touch.identifier === lookTouchRef.current.id) {
        const dx = touch.clientX - lookTouchRef.current.startX;
        const dy = touch.clientY - lookTouchRef.current.startY;
        holdTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
        camRef.current.yaw   = lookTouchRef.current.startYaw   + dx * -0.005;
        camRef.current.pitch = Math.max(-1.4, Math.min(1.4,
          lookTouchRef.current.startPitch + dy * -0.005
        ));
        // Reset 1s delay if camera moved before first break
        resetBreakDelay();
      }
    }
  }, [clearBreakInterval, resetBreakDelay]);

  const handleLookTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (lookTouchRef.current && touch.identifier === lookTouchRef.current.id) {
        clearBreakInterval();
        isHoldingRef.current = false;
        const elapsed = Date.now() - lookTouchRef.current.startTime;
        const dx = touch.clientX - lookTouchRef.current.startX;
        const dy = touch.clientY - lookTouchRef.current.startY;
        const moved = Math.abs(dx) > 10 || Math.abs(dy) > 10;
        // Quick tap = place block
        if (!moved && elapsed < 300) {
          placeBlock(lookTouchRef.current.startX, lookTouchRef.current.startY);
        }
        lookTouchRef.current = null;
      }
    }
  }, [placeBlock, clearBreakInterval]);

  // Keyboard controls
  useEffect(() => {
    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys.add(e.code);
      else keys.delete(e.code);
      if (e.code === 'Space' && e.type === 'keydown') {
        window.dispatchEvent(new CustomEvent('mc-jump'));
      }
    };

    const mouseLook = (e: MouseEvent) => {
      camRef.current.yaw   += e.movementX * -0.002;
      camRef.current.pitch  = Math.max(-1.4, Math.min(1.4, camRef.current.pitch + e.movementY * -0.002));
    };

    const onClick = () => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
      }
    };

    const frame = setInterval(() => {
      let dx = 0; let dz = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp'))    dz -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown'))  dz += 1;
      moveRef.current = { dx, dz };
    }, 16);

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    document.addEventListener('mousemove', mouseLook);
    document.addEventListener('click', onClick);
    return () => {
      clearInterval(frame);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('mousemove', mouseLook);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // Mouse click for desktop
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      if (e.button === 0) breakBlock();
      if (e.button === 2) { e.preventDefault(); placeBlock(); }
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [breakBlock, placeBlock]);

  const handleJoystickMove = useCallback((state: { dx: number; dz: number }) => {
    moveRef.current = state;
    // Reset 1s break delay if player starts moving before first break
    if (state.dx !== 0 || state.dz !== 0) {
      resetBreakDelay();
    }
  }, [resetBreakDelay]);

  return (
    <div
      style={{ width:'100vw', height:'100vh', position:'relative', overflow:'hidden', touchAction:'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        style={{ position:'absolute', inset:0 }}
        onTouchStart={handleLookTouchStart}
        onTouchMove={handleLookTouchMove}
        onTouchEnd={handleLookTouchEnd}
        onTouchCancel={handleLookTouchEnd}
      >
        <Canvas
          camera={{ fov:70, near:0.1, far:200, position:[0,40,0] }}
          style={{ width:'100%', height:'100%' }}
          gl={{ antialias:false, powerPreference:'high-performance', precision:'mediump' }}
          dpr={Math.min(window.devicePixelRatio, 1.5)}
        >
          <CameraController
            moveRef={moveRef}
            camRef={camRef}
            worldRef={worldRef}
            onCamPos={onCamPos}
            cameraRef={cameraRef}
          />
          <Scene
            world={worldRef.current}
            worldVersion={worldVersion}
            onBlockClick={() => {}}
            particleEventsRef={particleEventsRef}
          />
        </Canvas>
      </div>

      {/* Joystick */}
      <div style={{ position:'fixed', bottom:90, left:16, zIndex:100 }}>
        <TouchJoystick onMove={handleJoystickMove} size={160} />
      </div>

      {/* Jump button — Bedrock style */}
      <div style={{ position:'fixed', bottom:100, right:20, zIndex:100 }}>
        <div
          style={{
            width: 72, height: 72,
            background: 'rgba(255,255,255,0.13)',
            border: '2px solid rgba(255,255,255,0.25)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none',
          }}
          onTouchStart={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('mc-jump')); }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </div>
      </div>

      <HotBar selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
    </div>
  );
}
