import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BLOCK_THREE_COLORS } from "@/lib/terrain";

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

interface ParticleEvent {
  x: number;
  y: number;
  z: number;
  blockType: number;
}

const MAX_PARTICLES = 200;
const PARTICLE_SIZE = 0.08;

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
  const colorArr = useMemo(() => new Float32Array(MAX_PARTICLES * 3).fill(1), []);

  const geo = useMemo(() => new THREE.BoxGeometry(PARTICLE_SIZE, PARTICLE_SIZE, PARTICLE_SIZE), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: false }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Consume events
    while (eventsRef.current.length > 0) {
      const ev = eventsRef.current.pop()!;
      const color = new THREE.Color(BLOCK_THREE_COLORS[ev.blockType] ?? 0x888888);
      for (let i = 0; i < 12; i++) {
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
        };
        if (particles.current.length < MAX_PARTICLES) {
          particles.current.push(p);
          const idx = particles.current.length - 1;
          colorArr[idx * 3] = color.r;
          colorArr[idx * 3 + 1] = color.g;
          colorArr[idx * 3 + 2] = color.b;
        } else {
          // Replace oldest
          const idx = Math.floor(Math.random() * MAX_PARTICLES);
          particles.current[idx] = p;
          colorArr[idx * 3] = color.r;
          colorArr[idx * 3 + 1] = color.g;
          colorArr[idx * 3 + 2] = color.b;
        }
      }
    }

    const mesh = meshRef.current;
    if (!mesh) return;

    // Update particles
    let alive = 0;
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.current.splice(i, 1);
        continue;
      }
      p.vel.y -= 12 * dt;
      p.pos.addScaledVector(p.vel, dt);
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (i < particles.current.length) {
        const p = particles.current[i];
        dummy.position.copy(p.pos);
        const s = p.life;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, new THREE.Color(colorArr[i * 3], colorArr[i * 3 + 1], colorArr[i * 3 + 2]));
        alive++;
      } else {
        dummy.position.set(0, -100, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = Math.max(alive, 1);
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, MAX_PARTICLES]} frustumCulled={false} />
  );
}
