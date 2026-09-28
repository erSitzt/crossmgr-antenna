import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Track } from '../model/types';
import { finishElevation, TrackPath } from '../rf/track';

const LEAD = 10; // extra metres drawn before the first / after the last segment

export function TrackMesh({ track }: { track: Track }) {
  const { surface, skirt, finish, edges, arrows } = useMemo(() => {
    const path = new TrackPath(track);
    const half = track.widthM / 2;
    const top: number[] = [];
    const topIdx: number[] = [];
    const side: number[] = [];
    const sideIdx: number[] = [];
    const edgeL: THREE.Vector3[] = [];
    const edgeR: THREE.Vector3[] = [];
    const step = 0.25;
    let n = 0;
    for (let s = path.trackStartS - LEAD; s <= path.trackEndS + LEAD + 1e-6; s += step, n++) {
      const l = path.point(s, -half, 0.005);
      const r = path.point(s, half, 0.005);
      top.push(...l, ...r);
      // skirts down to the ground on both sides (only visible where the track is raised)
      side.push(l[0], l[1], l[2], l[0], Math.min(0, l[1]), l[2], r[0], r[1], r[2], r[0], Math.min(0, r[1]), r[2]);
      edgeL.push(new THREE.Vector3(l[0], l[1] + 0.015, l[2]));
      edgeR.push(new THREE.Vector3(r[0], r[1] + 0.015, r[2]));
      if (n > 0) {
        const a = (n - 1) * 2;
        topIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        const b = (n - 1) * 4;
        sideIdx.push(b, b + 4, b + 1, b + 1, b + 4, b + 5); // left skirt
        sideIdx.push(b + 2, b + 3, b + 6, b + 3, b + 7, b + 6); // right skirt
      }
    }
    const surface = new THREE.BufferGeometry();
    surface.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    surface.setIndex(topIdx);
    surface.computeVertexNormals();
    const skirt = new THREE.BufferGeometry();
    skirt.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    skirt.setIndex(sideIdx);
    skirt.computeVertexNormals();

    // direction arrows every 10 m
    const arrows: { pos: THREE.Vector3; yaw: number }[] = [];
    for (let s = Math.ceil((path.trackStartS - LEAD) / 10) * 10; s <= path.trackEndS + LEAD; s += 10) {
      if (Math.abs(s) < 3) continue;
      const smp = path.sample(s);
      arrows.push({ pos: new THREE.Vector3(smp.pos[0], smp.pos[1] + 0.02, smp.pos[2]), yaw: Math.atan2(-smp.dir[2], smp.dir[0]) });
    }
    return { surface, skirt, finish: { half, y: finishElevation(track) }, edges: [edgeL, edgeR], arrows };
  }, [track]);

  return (
    <group>
      <mesh geometry={surface} receiveShadow>
        <meshStandardMaterial color="#6b5132" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial color="#4a3822" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {edges.map((pts, i) => (
        <Line key={i} points={pts} color="#e8e2d0" lineWidth={2} />
      ))}
      {/* finish line stripe */}
      <mesh position={[0, finish.y + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, finish.half * 2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {arrows.map((a, i) => (
        <group key={i} position={a.pos} rotation={[0, a.yaw, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.6, 3]} />
            <meshBasicMaterial color="#e8e2d0" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Transparent vertical plane that marks the finish line. */
export function FinishPlane({ width, y }: { width: number; y: number }) {
  return (
    <mesh position={[0, y + 2.5, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={1}>
      <planeGeometry args={[width, 5]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}
