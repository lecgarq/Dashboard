"use client";

/**
 * FormaParticleAccent — subtle R3F particle field rendered as a faint
 * full-bleed background behind the /forma-proposal editor.
 *
 * Cloned from app/(dashboard)/users/HeaderParticleAccent.tsx and tuned
 * to a "barely-there ambient" level (Plan 06-04, FRM-02).
 *
 * Constraints (PERF-05 / CONTEXT.md FRM-02):
 *  - position:absolute, inset:0 — spans behind the whole editor
 *  - pointer-events:none — never blocks any editor interaction
 *  - ssr:false — dynamic imported; this file is NEVER SSR'd
 *  - frameloop="demand" — idle GPU between drift ticks
 *  - ~110 particles, opacity 0.18 — barely-there ambient, GPU < 400MB
 *
 * This is the ONLY file under forma-proposal/ that may import
 * @react-three/fiber / Canvas (PERF-05 / Pitfall 1 guardrail).
 *
 * Plan: 06-04
 */

import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Particle geometry constants — tuned DOWN vs HeaderParticleAccent
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 110;

// Wider/taller spread for full-bleed coverage of the editor area
const SPREAD_X = 14;
const SPREAD_Y = 10;
const SPREAD_Z = 0.6;

// Slower drift for a barely-there ambient feel
const DRIFT_SPEED = 0.00008;

// LECG azul — identical to /users accent for product consistency
const PARTICLE_COLOR = new THREE.Color(0x4e8ccb);

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
// ParticleField — geometry + material + drift animation
// ---------------------------------------------------------------------------
function ParticleField() {
  const meshRef = useRef<THREE.Points>(null);
  const { invalidate } = useThree();

  const positions = useRef<Float32Array>(buildPositions());
  const velocities = useRef<Float32Array>(buildVelocities());

  // Periodic invalidate drive so frameloop="demand" produces gentle drift
  // ~12fps — trivial GPU cost for slow ambient movement
  useEffect(() => {
    const id = setInterval(() => {
      invalidate();
    }, 80);
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
    const halfY = SPREAD_Y / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 0] += vel[i * 3 + 0];
      pos[i * 3 + 1] += vel[i * 3 + 1];

      // Wrap horizontally and vertically so particles cycle continuously
      if (pos[i * 3 + 0] > halfX) pos[i * 3 + 0] = -halfX;
      if (pos[i * 3 + 0] < -halfX) pos[i * 3 + 0] = halfX;
      if (pos[i * 3 + 1] > halfY) pos[i * 3 + 1] = -halfY;
      if (pos[i * 3 + 1] < -halfY) pos[i * 3 + 1] = halfY;
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
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// FormaParticleAccent — default export (dynamic import target, ssr:false)
// ---------------------------------------------------------------------------
export default function FormaParticleAccent() {
  return (
    <Canvas
      frameloop="demand"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
      camera={{ position: [0, 0, 5], fov: 60 }}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
    >
      <ParticleField />
    </Canvas>
  );
}
