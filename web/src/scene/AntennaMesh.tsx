import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { forwardRef } from 'react';
import * as THREE from 'three';
import type { Antenna, AntennaProfile } from '../model/types';
import { DEG } from '../rf/math';
import { portColor } from '../store';

interface Props {
  antenna: Antenna;
  profile: AntennaProfile;
  selected: boolean;
  overLimit: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

export const AntennaMesh = forwardRef<THREE.Group, Props>(function AntennaMesh(
  { antenna, profile, selected, overLimit, onSelect },
  ref,
) {
  const [w, h, d] = profile.sizeM;
  const color = portColor(antenna.port);
  const coneLen = 0.9;
  const coneR = Math.tan((profile.hpbwAzDeg / 2) * DEG) * coneLen;
  return (
    <group
      ref={ref}
      position={antenna.position}
      rotation={[antenna.pitchDeg * DEG, antenna.yawDeg * DEG, antenna.rollDeg * DEG, 'YXZ']}
      onClick={onSelect}
    >
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={antenna.enabled ? '#f2f2f2' : '#777'}
          emissive={selected ? color : '#000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>
      {/* coloured radome face on the boresight side */}
      <mesh position={[0, 0, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.9, h * 0.9]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* beam cone (half-power beamwidth) */}
      {antenna.enabled && (
        <mesh position={[0, 0, d / 2 + coneLen / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[coneR, coneLen, 24, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <Html position={[0, h / 2 + 0.15, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div className={`ant-label${overLimit ? ' warn' : ''}`} style={{ borderColor: color }}>
          P{antenna.port} · {antenna.txDbm.toFixed(1)} dBm{overLimit ? ' ⚠' : ''}
        </div>
      </Html>
    </group>
  );
});
