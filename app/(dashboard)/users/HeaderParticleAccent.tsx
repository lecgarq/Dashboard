"use client";

/**
 * HeaderParticleAccent — subtle R3F particle field rendered ONLY behind
 * the /users page header KPI strip.
 *
 * Constraints (Pitfall 4, PERF-05):
 *  - position:absolute, inset:0 — confined to the header strip
 *  - pointer-events:none — never intercepts table interactions
 *  - ssr:false — dynamic imported; this file is NEVER SSR'd
 *  - frameloop="demand" — idle GPU between user interactions
 *  - ~150-200 drifting points, GPU < 400MB
 *
 * The only file in app/(dashboard)/users/ that contains a Canvas / @react-three import.
 * UsersDirectoryClient.tsx, DirectoryTableColumns.tsx, PeekPanel.tsx must NOT import this.
 *
 * Plan: 04-04
 */

import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Particle geometry constants
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 180;
const SPREAD_X = 8;
const SPREAD_Y = 1.5;
const SPREAD_Z = 0.5;
const DRIFT_SPEED = 0.00012;

// Brand-tinted color (indigo, low opacity) — matches CSS var --primary hue
const PARTICLE_COLOR = new THREE.Color(0x6366f1);

// ---------------------------------------------------------------------------
// Module-level helpers (called once at component init time)
// ---------------------------------------------------------------------------
function buildPositions(): Float32Array {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    arr[i * 3 + 0] = (Math.random() - 0.5) * SPREAD_X;
    arr[i * 3 + 1] = (Math.random() - 0.5) * SPREAD_Y;
    arr[i * 3 + 2] = (Math.random() - 0.5) * SPREAD_Z;
  }
  return arr;
}

function buildVelocities(): Float32Array {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    arr[i * 3 + 0] = (Math.random() - 0.5) * DRIFT_SPEED;
    arr[i * 3 + 1] = (Math.random() - 0.5) * DRIFT_SPEED * 0.3;
    arr[i * 3 + 2] = 0;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// ParticleField — the Three.js geometry + material + drift animation
// ---------------------------------------------------------------------------
function ParticleField() {
  const meshRef = useRef<THREE.Points>(null);
  const { invalidate } = useThree();

  // Build initial positions and velocities once per mount
  const positions = useRef<Float32Array>(buildPositions());
  const velocities = useRef<Float32Array>(buildVelocities());

  // Periodic invalidate drive so frameloop="demand" still produces gentle drift
  useEffect(() => {
    // Invalidate every ~80ms to drive slow drift (~12fps) — trivial GPU cost
    const id = setInterval(() => { invalidate(); }, 80);
    return () => clearInterval(id);
  }, [invalidate]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const attr = mesh.geometry.attributes["position"];
    if (!attr) return;
    const pos = attr.array as Float32Array;
    const vel = velocities.current;
    const halfX = SPREAD_X / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 0] += vel[i * 3 + 0];
      pos[i * 3 + 1] += vel[i * 3 + 1];

      // Wrap horizontally so particles cycle continuously
      if (pos[i * 3 + 0] > halfX) pos[i * 3 + 0] = -halfX;
      if (pos[i * 3 + 0] < -halfX) pos[i * 3 + 0] = halfX;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions.current, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={PARTICLE_COLOR}
        size={0.018}
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// HeaderParticleAccent — default export (dynamic import target)
// ---------------------------------------------------------------------------
export default function HeaderParticleAccent() {
  return (
    <Canvas
      frameloop="demand"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
      camera={{ position: [0, 0, 2], fov: 60 }}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
    >
      <ParticleField />
    </Canvas>
  );
}
