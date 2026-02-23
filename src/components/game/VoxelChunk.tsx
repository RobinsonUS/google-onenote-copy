import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { WorldData, BLOCK_TYPES, posKey } from "@/lib/terrain";
import { getBlockAtlasTexture, getBlockUV } from "@/lib/textures";

interface VoxelChunkProps {
  world: WorldData;
  version: number;
  onBlockClick: (x: number, y: number, z: number, face: THREE.Vector3) => void;
}

const FACES = [
  {
    dir: [0, 1, 0] as [number,number,number],
    corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] as [number,number,number][],
    uvRow: 0 as 0|1|2,
  },
  {
    dir: [0,-1, 0] as [number,number,number],
    corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] as [number,number,number][],
    uvRow: 2 as 0|1|2,
  },
  {
    dir: [1, 0, 0] as [number,number,number],
    corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] as [number,number,number][],
    uvRow: 1 as 0|1|2,
  },
  {
    dir: [-1,0, 0] as [number,number,number],
    corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] as [number,number,number][],
    uvRow: 1 as 0|1|2,
  },
  {
    dir: [0, 0, 1] as [number,number,number],
    corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] as [number,number,number][],
    uvRow: 1 as 0|1|2,
  },
  {
    dir: [0, 0,-1] as [number,number,number],
    corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] as [number,number,number][],
    uvRow: 1 as 0|1|2,
  },
];

const FACE_SHADE = [1.0, 0.5, 0.8, 0.8, 0.7, 0.7];

function buildMesh(world: WorldData): THREE.BufferGeometry {
  // Pre-count faces
  let faceCount = 0;
  const entries: [number, number, number, number][] = [];
  
  for (const [key, blockType] of world) {
    if (blockType === BLOCK_TYPES.AIR) continue;
    const i1 = key.indexOf(',');
    const i2 = key.indexOf(',', i1 + 1);
    const x = +key.substring(0, i1);
    const y = +key.substring(i1 + 1, i2);
    const z = +key.substring(i2 + 1);
    entries.push([x, y, z, blockType]);
    
    for (let f = 0; f < 6; f++) {
      const dir = FACES[f].dir;
      const neighbor = world.get(posKey(x + dir[0], y + dir[1], z + dir[2])) ?? BLOCK_TYPES.AIR;
      if (neighbor !== BLOCK_TYPES.AIR && neighbor !== BLOCK_TYPES.LEAVES) continue;
      if (blockType === BLOCK_TYPES.LEAVES && neighbor === BLOCK_TYPES.LEAVES) continue;
      faceCount++;
    }
  }

  const positions = new Float32Array(faceCount * 4 * 3);
  const normals   = new Float32Array(faceCount * 4 * 3);
  const uvs       = new Float32Array(faceCount * 4 * 2);
  const colors    = new Float32Array(faceCount * 4 * 3);
  const indices   = new Uint32Array(faceCount * 6);
  let vi = 0, fi = 0;

  for (let e = 0; e < entries.length; e++) {
    const [x, y, z, blockType] = entries[e];

    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const dir = face.dir;
      const neighbor = world.get(posKey(x + dir[0], y + dir[1], z + dir[2])) ?? BLOCK_TYPES.AIR;
      if (neighbor !== BLOCK_TYPES.AIR && neighbor !== BLOCK_TYPES.LEAVES) continue;
      if (blockType === BLOCK_TYPES.LEAVES && neighbor === BLOCK_TYPES.LEAVES) continue;

      const shade = FACE_SHADE[f];
      const [u0, u1, v0, v1] = getBlockUV(blockType, face.uvRow);
      const vOffset = vi;
      const dx = dir[0], dy = dir[1], dz = dir[2];

      for (let ci = 0; ci < 4; ci++) {
        const corner = face.corners[ci];
        const pi = vi * 3;
        positions[pi]   = x + corner[0];
        positions[pi+1] = y + corner[1];
        positions[pi+2] = z + corner[2];
        normals[pi]   = dx;
        normals[pi+1] = dy;
        normals[pi+2] = dz;
        colors[pi]   = shade;
        colors[pi+1] = shade;
        colors[pi+2] = shade;
        vi++;
      }

      const ui = (vi - 4) * 2;
      uvs[ui]   = u0; uvs[ui+1] = v0;
      uvs[ui+2] = u0; uvs[ui+3] = v1;
      uvs[ui+4] = u1; uvs[ui+5] = v1;
      uvs[ui+6] = u1; uvs[ui+7] = v0;

      const ii = fi * 6;
      indices[ii]   = vOffset;
      indices[ii+1] = vOffset+1;
      indices[ii+2] = vOffset+2;
      indices[ii+3] = vOffset;
      indices[ii+4] = vOffset+2;
      indices[ii+5] = vOffset+3;
      fi++;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function VoxelChunk({ world, version, onBlockClick }: VoxelChunkProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  const buildIdRef = useRef(0);

  // Build mesh asynchronously to avoid blocking physics frames
  useEffect(() => {
    const id = ++buildIdRef.current;
    // Use setTimeout to yield to the physics/render loop first
    const timer = setTimeout(() => {
      if (id !== buildIdRef.current) return; // stale
      const newGeo = buildMesh(world);
      setGeo(prev => {
        prev?.dispose();
        return newGeo;
      });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const mat = useRef(
    new THREE.MeshLambertMaterial({
      map: getBlockAtlasTexture(),
      vertexColors: true,
      side: THREE.FrontSide,
      alphaTest: 0.1,
    })
  ).current;

  if (!geo) return null;
  return <mesh ref={meshRef} geometry={geo} material={mat} />;
}
