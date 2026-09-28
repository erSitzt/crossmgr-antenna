import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Track } from '../model/types';
import { TrackPath } from '../rf/track';

export function TrackMesh({ track }: { track: Track }) {
  const { geometry, finish, edges } = useMemo(() => {
    const path = new TrackPath(track);
    const half = track.widthM / 2;
    const pos: number[] = [];
    const idx: number[] = [];
    const edgeL: THREE.Vector3[] = [];
    const edgeR: THREE.Vector3[] = [];
    const step = 0.25;
    let n = 0;
    for (let s = path.minS; s <= path.maxS; s += step, n++) {
      const l = path.point(s, -half, 0.005);
      const r = path.point(s, half, 0.005);
      pos.push(...l, ...r);
      edgeL.push(new THREE.Vector3(l[0], 0.02, l[2]));
      edgeR.push(new THREE.Vector3(r[0], 0.02, r[2]));
      if (n > 0) {
        const a = (n - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geometry: g, finish: half, edges: [edgeL, edgeR] };
  }, [track]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color="#6b5132" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {edges.map((pts, i) => (
        <Line key={i} points={pts} color="#e8e2d0" lineWidth={2} />
      ))}
      {/* finish line stripe */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, finish * 2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* direction arrow */}
      <mesh position={[-6, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 3]} />
        <meshBasicMaterial color="#e8e2d0" />
      </mesh>
    </group>
  );
}

/** Transparent vertical plane that marks the finish line. */
export function FinishPlane({ width }: { width: number }) {
  return (
    <mesh position={[0, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={1}>
      <planeGeometry args={[width, 5]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}
