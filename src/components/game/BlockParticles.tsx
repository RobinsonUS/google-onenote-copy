import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getBlockAtlasTexture, getBlockUV } from "@/lib/textures";

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  uvOffset: [number, number];
  rot: number; // fixed rotation per particle
}

interface ParticleEvent {
  x: number;
  y: number;
  z: number;
  blockType: number;
}

const MAX_PARTICLES = 200;
const PARTICLE_SIZE = 0.12;
// Each particle shows a small fraction of the block texture
const UV_FRAC = 0.25; // 1/4 of the face texture per particle

export function useBlockParticles() {
  const particlesRef = useRef<ParticleEvent[]>([]);

  const emit = (x: number, y: number, z: number, blockType: number) => {
    particlesRef.current.push({ x, y, z, blockType });
  };

  return { particlesRef, emit };
}

export function BlockParticles({ eventsRef }: { eventsRef: React.MutableRefObject<ParticleEvent[]> }) {
  const particles = useRef<Particle[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // We create a PlaneGeometry for each particle; UVs will be set per-instance via a custom attribute
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(PARTICLE_SIZE, PARTICLE_SIZE);
    // Add custom UV offset/scale attributes for instancing
    const count = MAX_PARTICLES;
    const uvOffsets = new Float32Array(count * 2);
    const uvScales = new Float32Array(count * 2);
    const uvBase = new Float32Array(count * 4); // u0, u1, v0, v1 per instance
    g.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
    g.setAttribute('uvScale', new THREE.InstancedBufferAttribute(uvScales, 2));
    return g;
  }, []);

  // Store per-particle UV data
  const uvData = useRef<{ u0: number; u1: number; v0: number; v1: number; su: number; sv: number }[]>([]);

  const mat = useMemo(() => {
    const atlas = getBlockAtlasTexture();
    const m = new THREE.MeshLambertMaterial({
      map: atlas,
      transparent: true,
      alphaTest: 0.1,
    });

    // Override UV in the shader to pick a sub-region of the atlas per instance
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute vec2 uvOffset;
attribute vec2 uvScale;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vMapUv = uvOffset + vMapUv * uvScale;`
      );
    };
    return m;
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Consume events
    while (eventsRef.current.length > 0) {
      const ev = eventsRef.current.pop()!;
      // Use the side face (row 1) for particles, like Minecraft
      const [u0, u1, v0, v1] = getBlockUV(ev.blockType, 1);
      const fullU = u1 - u0;
      const fullV = v1 - v0;
      const subU = fullU * UV_FRAC;
      const subV = fullV * UV_FRAC;

      for (let i = 0; i < 12; i++) {
        // Random sub-region within the face
        const su = u0 + Math.random() * (fullU - subU);
        const sv = v0 + Math.random() * (fullV - subV);

        const p: Particle = {
          pos: new THREE.Vector3(
            ev.x + 0.5 + (Math.random() - 0.5) * 0.8,
            ev.y + 0.5 + (Math.random() - 0.5) * 0.8,
            ev.z + 0.5 + (Math.random() - 0.5) * 0.8,
          ),
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            Math.random() * 4 + 1,
            (Math.random() - 0.5) * 3,
          ),
          life: 0.6 + Math.random() * 0.4,
          uvOffset: [su, sv],
          rot: Math.random() * Math.PI * 2,
        };

        if (particles.current.length < MAX_PARTICLES) {
          particles.current.push(p);
          uvData.current.push({ u0: su, u1: su + subU, v0: sv, v1: sv + subV, su: subU, sv: subV });
        } else {
          const idx = Math.floor(Math.random() * MAX_PARTICLES);
          particles.current[idx] = p;
          uvData.current[idx] = { u0: su, u1: su + subU, v0: sv, v1: sv + subV, su: subU, sv: subV };
        }
      }
    }

    const mesh = meshRef.current;
    if (!mesh) return;

    const uvOffsetAttr = geo.getAttribute('uvOffset') as THREE.InstancedBufferAttribute;
    const uvScaleAttr = geo.getAttribute('uvScale') as THREE.InstancedBufferAttribute;

    // Update particles physics
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.current.splice(i, 1);
        uvData.current.splice(i, 1);
        continue;
      }
      p.vel.y -= 12 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
    }

    let alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (i < particles.current.length) {
        const p = particles.current[i];
        const uv = uvData.current[i];
        dummy.position.copy(p.pos);
        const s = p.life;
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, 0, p.rot);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        // Set UV offset and scale for this instance
        uvOffsetAttr.setXY(i, uv.u0, uv.v0);
        uvScaleAttr.setXY(i, uv.su, uv.sv);

        alive++;
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    uvOffsetAttr.needsUpdate = true;
    uvScaleAttr.needsUpdate = true;
    mesh.count = Math.max(alive, 1);
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, MAX_PARTICLES]} frustumCulled={false} />
  );
}
