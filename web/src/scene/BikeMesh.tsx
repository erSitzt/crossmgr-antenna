import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Setup } from '../model/types';
import type { Trajectory } from '../rf/lines';
import { BIKE, placeBike, tagLinks, tagLocalAxis, tagLocalPosition } from '../rf/tagView';
import { DEG } from '../rf/math';
import { RealBike, RiderModel } from './RealBike';

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
function Bike({ rider, real, realRider, helmetTopY }: { rider: boolean; real: boolean; realRider: boolean; helmetTopY: number }) {
  const rake = BIKE.rakeDeg * DEG;
  const fw = BIKE.frontWheelR, rw = BIKE.rearWheelR;
  const forkTop: [number, number] = [-BIKE.forkLen * Math.sin(rake), fw + BIKE.forkLen * Math.cos(rake)];
  const plateTilt = BIKE.plateTiltDeg * DEG;
  const simple = (
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
    </group>
  );
  return (
    <group>
      {real ? <RealBike fallback={simple} /> : simple}
      {rider && <RiderModel helmetTopY={helmetTopY} realRider={realRider} />}
    </group>
  );
}

const marginColor = (m: number) => (m >= 6 ? '#30a46c' : m >= 0 ? '#f5a623' : '#e5484d');

/** Helmet top follows a helmet-mounted tag (tag 2 first, then tag 1); default posture otherwise. */
function helmetTopY(setup: Setup): number {
  if (setup.tag2Enabled && setup.tag2.mount === 'helmet') return setup.tag2.heightM + 0.05;
  if (setup.tag.mount === 'helmet') return setup.tag.heightM + 0.05;
  return 1.75;
}

export function BikeWithTag({
  setup, traj, s, rider, showLinks, real, realRider,
}: { setup: Setup; traj: Trajectory; s: number; rider: boolean; showLinks: boolean; real: boolean; realRider: boolean }) {
  const { place, links } = useMemo(() => {
    const place = placeBike(setup, traj, s);
    return { place, links: tagLinks(setup, place) };
  }, [setup, traj, s]);
  const tags = setup.tag2Enabled ? [setup.tag, setup.tag2] : [setup.tag];
  // tag 2 is drawn relative to tag 1 (same rigid offset the simulation uses)
  const t1 = tagLocalPosition(setup.tag);

  return (
    <group>
      <group position={place.origin} rotation={[0, place.yaw, 0]}>
        <Bike rider={rider} real={real} realRider={realRider} helmetTopY={helmetTopY(setup)} />
        {tags.map((tag, i) => {
          const local = tagLocalPosition(tag);
          const pos: [number, number, number] = i === 0 ? t1 : [local[0], local[1], local[2]];
          return <TagMarker key={i} tag={tag} pos={pos} label={tags.length > 1 ? `T${i + 1}` : undefined} />;
        })}
      </group>
      {showLinks &&
        links.map((l) => {
          const t = new THREE.Vector3(...l.tagPos);
          const a = new THREE.Vector3(...l.antennaPos);
          const mid = t.clone().lerp(a, l.tagNo === 1 ? 0.5 : 0.62);
          return (
            <group key={`${l.tagNo}-${l.antennaId}`}>
              <Line
                points={[t, a]}
                color={marginColor(l.margin)}
                lineWidth={l.tagNo === 1 ? 2 : 1.5}
                dashed={l.margin < 0 || l.tagNo === 2}
                dashSize={l.tagNo === 2 ? 0.08 : 0.2}
                gapSize={l.tagNo === 2 ? 0.08 : 0.15}
              />
              <Html position={mid} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
                <div className="ant-label" style={{ borderColor: marginColor(l.margin) }}>
                  {setup.tag2Enabled ? `T${l.tagNo} ` : ''}P{l.port} {l.margin >= 0 ? '+' : ''}{l.margin.toFixed(1)} dB
                </div>
              </Html>
            </group>
          );
        })}
    </group>
  );
}

/** The tag (Dogbone ≈ 94 × 24 mm, drawn 2× for visibility) with its dipole axis. */
function TagMarker({ tag, pos, label }: { tag: Setup['tag']; pos: [number, number, number]; label?: string }) {
  const axis = tagLocalAxis(tag);
  const axisV = new THREE.Vector3(...axis);
  const quat = axisV.lengthSq() > 0 ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axisV.clone().normalize()) : new THREE.Quaternion();
  const p = new THREE.Vector3(...pos);
  return (
    <group>
      <mesh position={p} quaternion={quat}>
        <boxGeometry args={[0.19, 0.05, 0.006]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {axisV.lengthSq() > 0 && (
        <Line points={[p.clone().addScaledVector(axisV, -0.3), p.clone().addScaledVector(axisV, 0.3)]} color="#ffd166" lineWidth={3} />
      )}
      {label && (
        <Html position={[p.x, p.y + 0.12, p.z]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="ant-label" style={{ borderColor: '#ffd166' }}>{label}</div>
        </Html>
      )}
    </group>
  );
}
