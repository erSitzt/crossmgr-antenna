import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Setup } from '../model/types';
import type { SimResult } from '../rf/passSim';
import { trajPoint } from '../rf/lines';
import { TrackPath } from '../rf/track';
import { portColor } from '../store';

/** Lane paths, read events of the selected lane and the estimated "virtual wall". */
export function PassPaths({ sim, setup, selectedLane }: { sim: SimResult; setup: Setup; selectedLane: number }) {
  const { lanes, wall, lineMarks, reads } = useMemo(() => {
    const path = new TrackPath(setup.track);
    const h = setup.tag.heightM;
    const r = setup.sim.rangeM;
    const lanes = sim.lanes.map((l) => {
      const pts: THREE.Vector3[] = [];
      for (let s = -r; s <= r; s += 0.5) pts.push(new THREE.Vector3(...trajPoint(path, l.trajectory, s, h)));
      return { pts, kind: l.kind };
    });
    const wall = sim.lanes.filter((l) => l.wallPoint && l.kind === 'lane').map((l) => new THREE.Vector3(...l.wallPoint!));
    const lineMarks = sim.lanes.filter((l) => l.wallPoint && l.kind !== 'lane').map((l) => new THREE.Vector3(...l.wallPoint!));
    const v = setup.sim.speedKmh / 3.6;
    const lane = sim.lanes[selectedLane];
    const reads = (lane?.sampleReads ?? []).map((rd) => ({
      p: new THREE.Vector3(...trajPoint(path, lane.trajectory, lane.crossS + rd.t * v, h)),
      c: portColor(rd.port),
    }));
    return { lanes, wall, lineMarks, reads };
  }, [sim, setup.track, setup.tag.heightM, setup.sim.rangeM, setup.sim.speedKmh, selectedLane]);

  return (
    <group>
      {lanes.map((l, i) => (
        <Line
          key={i}
          points={l.pts}
          color={i === selectedLane ? '#ffffff' : l.kind === 'lane' ? '#9aa4b2' : '#ffb454'}
          lineWidth={i === selectedLane ? 2.5 : l.kind === 'lane' ? 1 : 1.8}
          dashed={l.kind === 'random'}
          dashSize={0.4}
          gapSize={0.25}
          transparent
          opacity={0.7}
        />
      ))}
      {reads.map((r, i) => (
        <mesh key={i} position={r.p}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color={r.c} />
        </mesh>
      ))}
      {wall.length > 1 && <Line points={wall} color="#ff2d55" lineWidth={4} />}
      {lineMarks.map((p, i) => (
        <mesh key={`l${i}`} position={p}>
          <sphereGeometry args={[0.11, 12, 12]} />
          <meshBasicMaterial color="#ffb454" />
        </mesh>
      ))}
      {wall.map((p, i) => (
        <mesh key={`w${i}`} position={p}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#ff2d55" />
        </mesh>
      ))}
    </group>
  );
}
