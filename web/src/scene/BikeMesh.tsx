import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Setup } from '../model/types';
import type { Trajectory } from '../rf/lines';
import { BIKE, placeBike, tagLinks, tagLocalAxis, tagLocalPosition } from '../rf/tagView';
import { DEG } from '../rf/math';

const PLASTIC = '#e8e8e8';
const DARK = '#2a2d33';
const METAL = '#9aa0a8';

function Rod({ from, to, r, color }: { from: [number, number, number]; to: [number, number, number]; r: number; color: string }) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(b, a);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return (
    <mesh position={a.clone().add(b).multiplyScalar(0.5)} quaternion={q}>
      <cylinderGeometry args={[r, r, dir.length(), 10]} />
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
    </mesh>
  );
}

/** Simplified motocross bike (and rider) in the bike frame: X forward, Y up, Z right. */
function Bike({ rider }: { rider: boolean }) {
  const rake = BIKE.rakeDeg * DEG;
  const fw = BIKE.frontWheelR, rw = BIKE.rearWheelR;
  const forkTop: [number, number] = [-BIKE.forkLen * Math.sin(rake), fw + BIKE.forkLen * Math.cos(rake)];
  const plateTilt = BIKE.plateTiltDeg * DEG;
  return (
    <group>
      {/* wheels */}
      <mesh position={[0, fw, 0]}>
        <torusGeometry args={[fw - 0.05, 0.05, 10, 32]} />
        <meshStandardMaterial color={DARK} roughness={0.9} />
      </mesh>
      <mesh position={[-BIKE.wheelbase, rw, 0]}>
        <torusGeometry args={[rw - 0.06, 0.06, 10, 32]} />
        <meshStandardMaterial color={DARK} roughness={0.9} />
      </mesh>
      {/* fork legs + bars */}
      {[-1, 1].map((sz) => (
        <Rod key={sz} from={[0, fw, sz * BIKE.forkHalfGap]} to={[forkTop[0], forkTop[1], sz * BIKE.forkHalfGap]} r={0.028} color={METAL} />
      ))}
      <Rod from={[forkTop[0] - 0.05, forkTop[1] + 0.05, -0.41]} to={[forkTop[0] - 0.05, forkTop[1] + 0.05, 0.41]} r={0.012} color={DARK} />
      {/* front number plate (leans back with the fork) */}
      <mesh position={[-0.21, 0.95, 0]} rotation={[0, 0, plateTilt]}>
        <boxGeometry args={[0.012, 0.25, 0.28]} />
        <meshStandardMaterial color={PLASTIC} />
      </mesh>
      {/* front fender */}
      <mesh position={[0.05, fw + 0.12 + fw * 0.3, 0]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.55, 0.012, 0.13]} />
        <meshStandardMaterial color={PLASTIC} />
      </mesh>
      {/* tank, seat, engine, side plates, rear fender, swingarm */}
      <mesh position={[-0.72, 0.98, 0]}>
        <boxGeometry args={[0.45, 0.2, 0.26]} />
        <meshStandardMaterial color="#e5484d" />
      </mesh>
      <mesh position={[-1.12, 1.0, 0]}>
        <boxGeometry args={[0.75, 0.07, 0.22]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[-0.78, 0.55, 0]}>
        <boxGeometry args={[0.42, 0.34, 0.24]} />
        <meshStandardMaterial color={METAL} metalness={0.6} />
      </mesh>
      {[-1, 1].map((sz) => (
        <mesh key={sz} position={[-1.25, 0.78, sz * 0.14]}>
          <boxGeometry args={[0.36, 0.24, 0.01]} />
          <meshStandardMaterial color={PLASTIC} />
        </mesh>
      ))}
      <mesh position={[-1.6, 0.98, 0]} rotation={[0, 0, 0.25]}>
        <boxGeometry args={[0.45, 0.012, 0.18]} />
        <meshStandardMaterial color={PLASTIC} />
      </mesh>
      <Rod from={[-BIKE.wheelbase, rw, 0]} to={[-0.85, 0.45, 0]} r={0.035} color={METAL} />
      {rider && (
        <group>
          {/* torso, helmet, arms, legs */}
          <Rod from={[-1.0, 1.08, 0]} to={[-0.74, 1.55, 0]} r={0.14} color="#3e8ef7" />
          <mesh position={[-0.62, 1.72, 0]}>
            <sphereGeometry args={[0.14, 16, 16]} />
            <meshStandardMaterial color="#f5a623" />
          </mesh>
          {[-1, 1].map((sz) => (
            <group key={sz}>
              <Rod from={[-0.74, 1.5, sz * 0.2]} to={[forkTop[0] - 0.05, forkTop[1] + 0.07, sz * 0.36]} r={0.045} color="#3e8ef7" />
              <Rod from={[-1.0, 1.08, sz * 0.13]} to={[-0.78, 0.72, sz * 0.2]} r={0.07} color={DARK} />
              <Rod from={[-0.78, 0.72, sz * 0.2]} to={[-0.95, 0.35, sz * 0.2]} r={0.06} color={DARK} />
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

const marginColor = (m: number) => (m >= 6 ? '#30a46c' : m >= 0 ? '#f5a623' : '#e5484d');

export function BikeWithTag({
  setup, traj, s, rider, showLinks,
}: { setup: Setup; traj: Trajectory; s: number; rider: boolean; showLinks: boolean }) {
  const { place, links, tagLocal, axis } = useMemo(() => {
    const place = placeBike(setup, traj, s);
    return { place, links: tagLinks(setup, place), tagLocal: tagLocalPosition(setup.tag), axis: tagLocalAxis(setup.tag) };
  }, [setup, traj, s]);

  const axisV = new THREE.Vector3(...axis);
  const tagQuat = axisV.lengthSq() > 0 ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axisV.clone().normalize()) : new THREE.Quaternion();
  const tl = new THREE.Vector3(...tagLocal);
  const tagPos = new THREE.Vector3(...place.tagPos);

  return (
    <group>
      <group position={place.origin} rotation={[0, place.yaw, 0]}>
        <Bike rider={rider} />
        {/* the tag: Dogbone ≈ 94 × 24 mm, drawn 2× for visibility, plus its dipole axis */}
        <mesh position={tl} quaternion={tagQuat}>
          <boxGeometry args={[0.19, 0.05, 0.006]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {axis.some((v) => v !== 0) && (
          <Line points={[tl.clone().addScaledVector(axisV, -0.3), tl.clone().addScaledVector(axisV, 0.3)]} color="#ffd166" lineWidth={3} />
        )}
      </group>
      {showLinks &&
        links.map((l) => {
          const a = new THREE.Vector3(...l.antennaPos);
          const mid = tagPos.clone().lerp(a, 0.5);
          return (
            <group key={l.antennaId}>
              <Line points={[tagPos, a]} color={marginColor(l.margin)} lineWidth={2} dashed={l.margin < 0} dashSize={0.2} gapSize={0.15} />
              <Html position={mid} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
                <div className="ant-label" style={{ borderColor: marginColor(l.margin) }}>
                  P{l.port} {l.margin >= 0 ? '+' : ''}{l.margin.toFixed(1)} dB
                </div>
              </Html>
            </group>
          );
        })}
    </group>
  );
}
