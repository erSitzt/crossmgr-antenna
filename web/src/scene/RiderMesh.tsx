import * as THREE from 'three';
import { BIKE } from '../rf/tagView';
import { DEG } from '../rf/math';

type V3 = [number, number, number];

/** Rounded limb segment (capsule) between two points. */
function Limb({ a, b, r, color }: { a: V3; b: V3; r: number; color: string }) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const d = new THREE.Vector3().subVectors(vb, va);
  const len = Math.max(d.length() - 2 * r, 0.001);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return (
    <mesh position={va.clone().add(vb).multiplyScalar(0.5)} quaternion={q} castShadow>
      <capsuleGeometry args={[r, len, 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export const HELMET_X = -0.62;

/**
 * Motocross rider in the bike frame (X forward, Y up, Z right). `helmetTopY` sets the posture:
 * ≈ 1.62 m seated, ≈ 1.92 m standing on the pegs (attack position); in between is blended.
 */
export function Rider({ helmetTopY = 1.75, jersey = '#3e8ef7', pants = '#2a2d33', helmet = '#f5a623' }: {
  helmetTopY?: number;
  jersey?: string;
  pants?: string;
  helmet?: string;
}) {
  const k = Math.min(Math.max((helmetTopY - 1.62) / 0.3, 0), 1); // 0 seated … 1 standing
  const rake = BIKE.rakeDeg * DEG;
  const barX = -BIKE.forkLen * Math.sin(rake) - 0.05;
  const barY = BIKE.frontWheelR + BIKE.forkLen * Math.cos(rake) + 0.07;

  const headC: V3 = [HELMET_X, helmetTopY - 0.14, 0];
  const neck: V3 = [headC[0] - 0.06, headC[1] - 0.2, 0];
  const hip: V3 = lerp3([-1.02, 1.06, 0], [-0.92, 1.28, 0], k);
  const shoulderY = neck[1] - 0.05;
  const peg: V3 = [-0.88, 0.36, 0];

  return (
    <group>
      {/* torso (jersey) */}
      <Limb a={[hip[0], hip[1] + 0.08, 0]} b={[neck[0] - 0.02, shoulderY, 0]} r={0.16} color={jersey} />
      {/* helmet with visor, chin bar and goggles */}
      <mesh position={headC} castShadow>
        <sphereGeometry args={[0.14, 20, 16]} />
        <meshStandardMaterial color={helmet} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[headC[0] + 0.1, headC[1] - 0.09, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.14, 0.07, 0.16]} />
        <meshStandardMaterial color={helmet} roughness={0.35} />
      </mesh>
      <mesh position={[headC[0] + 0.12, headC[1] + 0.1, 0]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[0.13, 0.015, 0.2]} />
        <meshStandardMaterial color="#1b1f24" />
      </mesh>
      <mesh position={[headC[0] + 0.12, headC[1] + 0.01, 0]}>
        <boxGeometry args={[0.04, 0.06, 0.2]} />
        <meshStandardMaterial color="#111" metalness={0.6} roughness={0.2} />
      </mesh>
      {[-1, 1].map((sz) => {
        const shoulder: V3 = [neck[0] - 0.02, shoulderY - 0.02, sz * 0.2];
        const hand: V3 = [barX, barY, sz * 0.36];
        const elbow: V3 = [lerp(shoulder[0], hand[0], 0.45) - 0.02, Math.max(shoulder[1], hand[1]) - 0.05, sz * 0.36];
        const hipS: V3 = [hip[0], hip[1], sz * 0.12];
        const ankle: V3 = [peg[0], peg[1] + 0.08, sz * 0.2];
        // knee sits forward/outward of the line hip→ankle; higher when seated
        const knee: V3 = lerp3([-0.66, 0.86, sz * 0.22], [-0.7, 0.9, sz * 0.2], k);
        return (
          <group key={sz}>
            <Limb a={shoulder} b={elbow} r={0.055} color={jersey} />
            <Limb a={elbow} b={hand} r={0.045} color={jersey} />
            <mesh position={hand}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshStandardMaterial color="#1b1f24" />
            </mesh>
            <Limb a={hipS} b={knee} r={0.08} color={pants} />
            <Limb a={knee} b={ankle} r={0.065} color={pants} />
            {/* boot */}
            <mesh position={[peg[0] + 0.05, peg[1] + 0.12, sz * 0.2]} castShadow>
              <boxGeometry args={[0.28, 0.32, 0.12]} />
              <meshStandardMaterial color="#f2f2f2" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
