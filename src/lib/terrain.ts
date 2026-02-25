// Simple noise function for terrain generation
function hash(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263) ^ ((x * 668265263) + (z * 374761393));
  h = (h ^ (h >>> 13)) * 1274126177;
  // Keep it in 32-bit range
  h = h | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  // Smooth interpolation
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (d - b - c + a) * ux * uz;
}

function octaveNoise(x: number, z: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;

  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, z * frequency) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / max;
}

export const BLOCK_TYPES = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  SAND: 5,
  WATER: 6,
  LEAVES: 7,
  SNOW: 8,
  PLANKS: 9,
} as const;

export type BlockType = typeof BLOCK_TYPES[keyof typeof BLOCK_TYPES];

export const BLOCK_COLORS: Record<number, string> = {
  [BLOCK_TYPES.AIR]: 'transparent',
  [BLOCK_TYPES.GRASS]: '#4CAF50',
  [BLOCK_TYPES.DIRT]: '#8B5E3C',
  [BLOCK_TYPES.STONE]: '#9E9E9E',
  [BLOCK_TYPES.WOOD]: '#795548',
  [BLOCK_TYPES.SAND]: '#F4E04D',
  [BLOCK_TYPES.WATER]: '#2196F3',
  [BLOCK_TYPES.LEAVES]: '#2E7D32',
  [BLOCK_TYPES.SNOW]: '#ECEFF1',
  [BLOCK_TYPES.PLANKS]: '#B8945A',
};

export const BLOCK_THREE_COLORS: Record<number, number> = {
  [BLOCK_TYPES.GRASS]: 0x5a9134,
  [BLOCK_TYPES.DIRT]: 0x866043,
  [BLOCK_TYPES.STONE]: 0x7a7a7a,
  [BLOCK_TYPES.WOOD]: 0x684E28,
  [BLOCK_TYPES.SAND]: 0xdbc883,
  [BLOCK_TYPES.WATER]: 0x2662c8,
  [BLOCK_TYPES.LEAVES]: 0x2a6b1e,
  [BLOCK_TYPES.SNOW]: 0xe0eaf0,
  [BLOCK_TYPES.PLANKS]: 0xb8945a,
};

export const BLOCK_NAMES: Record<number, string> = {
  [BLOCK_TYPES.GRASS]: 'Herbe',
  [BLOCK_TYPES.DIRT]: 'Terre',
  [BLOCK_TYPES.STONE]: 'Pierre',
  [BLOCK_TYPES.WOOD]: 'Bois',
  [BLOCK_TYPES.SAND]: 'Sable',
  [BLOCK_TYPES.LEAVES]: 'Feuilles',
  [BLOCK_TYPES.PLANKS]: 'Planches',
};

export type WorldData = Map<string, BlockType>;

export function posKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function generateTerrain(size: number = 32, seed: number = 42): WorldData {
  const world: WorldData = new Map();
  const SEA_LEVEL = 4;
  const MAX_HEIGHT = 12;

  for (let x = -size / 2; x < size / 2; x++) {
    for (let z = -size / 2; z < size / 2; z++) {
      const nx = (x + seed) * 0.05;
      const nz = (z + seed) * 0.05;
      const heightNoise = octaveNoise(nx, nz, 4);
      const height = Math.floor(SEA_LEVEL + heightNoise * MAX_HEIGHT);

      for (let y = 0; y <= height; y++) {
        let blockType: BlockType;
        if (y === height) {
          // Determine surface block
          if (height < SEA_LEVEL + 1) {
            blockType = BLOCK_TYPES.SAND;
          } else if (height > SEA_LEVEL + 8) {
            blockType = BLOCK_TYPES.SNOW;
          } else {
            blockType = BLOCK_TYPES.GRASS;
          }
        } else if (y > height - 3) {
          blockType = BLOCK_TYPES.DIRT;
        } else {
          blockType = BLOCK_TYPES.STONE;
        }
        world.set(posKey(x, y, z), blockType);
      }

      // Add trees occasionally
      if (height >= SEA_LEVEL + 2 && height <= SEA_LEVEL + 8) {
        const treeNoise = hash(x * 7 + seed, z * 7 + seed);
        if (treeNoise > 0.92) {
          // Tree trunk
          for (let ty = height + 1; ty <= height + 4; ty++) {
            world.set(posKey(x, ty, z), BLOCK_TYPES.WOOD);
          }
          // Leaves
          for (let lx = -2; lx <= 2; lx++) {
            for (let lz = -2; lz <= 2; lz++) {
              for (let ly = height + 3; ly <= height + 6; ly++) {
                if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly - (height + 5)) < 4) {
                  const lkey = posKey(x + lx, ly, z + lz);
                  if (!world.has(lkey)) {
                    world.set(lkey, BLOCK_TYPES.LEAVES);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return world;
}
