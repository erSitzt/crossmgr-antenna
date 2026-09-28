import type { ThreeEvent } from '@react-three/fiber';
import { forwardRef } from 'react';
import * as THREE from 'three';
import type { Obstacle } from '../model/types';
import { materialById } from '../presets/obstacles';
import { DEG } from '../rf/math';

interface Props {
  obstacle: Obstacle;
  selected: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

/** A row of `count` identical units centred on the obstacle position. */
export const ObstacleMesh = forwardRef<THREE.Group, Props>(function ObstacleMesh({ obstacle: o, selected, onSelect }, ref) {
  const [w, h, d] = o.sizeM;
  const color = materialById(o.materialId)?.color ?? '#b0b0b0';
  const n = Math.max(1, Math.round(o.count));
  const thin = d < 0.06;
  return (
    <group ref={ref} position={o.position} rotation={[0, o.yawDeg * DEG, 0]} onClick={onSelect}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[(i - (n - 1) / 2) * w, o.liftM + h / 2, 0]} castShadow>
          <boxGeometry args={[w * (thin ? 1 : 0.98), h, Math.max(d, 0.01)]} />
          <meshStandardMaterial
            color={color}
            roughness={0.9}
            transparent={thin}
            opacity={thin ? 0.8 : 1}
            side={thin ? THREE.DoubleSide : THREE.FrontSide}
            emissive={selected ? '#ffd166' : '#000'}
            emissiveIntensity={selected ? 0.35 : 0}
          />
        </mesh>
      ))}
      {/* posts for raised banners */}
      {thin && o.liftM > 0.05 &&
        [-1, 1].map((sgn) => (
          <mesh key={sgn} position={[(sgn * w * n) / 2, (o.liftM + h) / 2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, o.liftM + h, 6]} />
            <meshStandardMaterial color="#888" metalness={0.6} />
          </mesh>
        ))}
    </group>
  );
});
