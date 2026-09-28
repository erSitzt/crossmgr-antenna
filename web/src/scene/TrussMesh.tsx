import type { ThreeEvent } from '@react-three/fiber';
import { forwardRef } from 'react';
import * as THREE from 'three';
import type { Truss } from '../model/types';
import { DEG } from '../rf/math';

const TUBE = 0.05;

/** Square box truss member between two points (4 chords + ladder rungs). */
function Member({ from, to, section, color }: { from: THREE.Vector3; to: THREE.Vector3; section: number; color: string }) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const h = section / 2 - TUBE / 2;
  const rungs = Math.max(1, Math.floor(length / 0.5));
  return (
    <group position={mid} quaternion={quat}>
      {[[-h, -h], [h, -h], [-h, h], [h, h]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]} castShadow>
          <cylinderGeometry args={[TUBE / 2, TUBE / 2, length, 8]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      {Array.from({ length: rungs + 1 }, (_, i) => -length / 2 + (i * length) / rungs).map((y, i) => (
        <mesh key={`r${i}`} position={[0, y, 0]}>
          <boxGeometry args={[section, 0.02, section]} />
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.35} wireframe />
        </mesh>
      ))}
    </group>
  );
}

interface Props {
  truss: Truss;
  selected: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

export const TrussMesh = forwardRef<THREE.Group, Props>(function TrussMesh({ truss, selected, onSelect }, ref) {
  const half = truss.spanM / 2;
  const top = truss.heightM;
  const color = selected ? '#ffd166' : '#c9ced6';
  const s = truss.sectionM;
  return (
    <group ref={ref} position={truss.position} rotation={[0, truss.yawDeg * DEG, 0]} onClick={onSelect}>
      <Member from={new THREE.Vector3(0, 0, -half)} to={new THREE.Vector3(0, top + s / 2, -half)} section={s} color={color} />
      <Member from={new THREE.Vector3(0, 0, half)} to={new THREE.Vector3(0, top + s / 2, half)} section={s} color={color} />
      <Member from={new THREE.Vector3(0, top, -half - s / 2)} to={new THREE.Vector3(0, top, half + s / 2)} section={s} color={color} />
      {/* base plates */}
      {[-half, half].map((z) => (
        <mesh key={z} position={[0, 0.01, z]}>
          <boxGeometry args={[0.6, 0.02, 0.6]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      ))}
    </group>
  );
});
