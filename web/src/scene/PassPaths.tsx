import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Setup } from '../model/types';
import type { SimResult } from '../rf/passSim';
import { TrackPath } from '../rf/track';
import { portColor } from '../store';

/** Lane paths, read events of the selected lane and the estimated "virtual wall". */
export function PassPaths({ sim, setup, selectedLane }: { sim: SimResult; setup: Setup; selectedLane: number }) {
  const { lanes, wall, reads } = useMemo(() => {
    const path = new TrackPath(setup.track);
    const h = setup.tag.heightM;
    const r = setup.sim.rangeM;
    const lanes = sim.lanes.map((l) => {
      const pts: THREE.Vector3[] = [];
      for (let s = -r; s <= r; s += 0.5) pts.push(new THREE.Vector3(...path.lanePoint(s, l.laneFrac, h)));
      return pts;
    });
    const wall = sim.lanes.filter((l) => l.wallPoint).map((l) => new THREE.Vector3(...l.wallPoint!));
    const v = setup.sim.speedKmh / 3.6;
    const lane = sim.lanes[selectedLane];
    const reads = (lane?.sampleReads ?? []).map((rd) => ({
      p: new THREE.Vector3(...path.lanePoint(rd.t * v, lane.laneFrac, h)),
      c: portColor(rd.port),
    }));
    return { lanes, wall, reads };
  }, [sim, setup.track, setup.tag.heightM, setup.sim.rangeM, setup.sim.speedKmh, selectedLane]);

  return (
    <group>
      {lanes.map((pts, i) => (
        <Line key={i} points={pts} color={i === selectedLane ? '#ffffff' : '#9aa4b2'} lineWidth={i === selectedLane ? 2 : 1} transparent opacity={0.6} />
      ))}
      {reads.map((r, i) => (
        <mesh key={i} position={r.p}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color={r.c} />
        </mesh>
      ))}
      {wall.length > 1 && <Line points={wall} color="#ff2d55" lineWidth={4} />}
      {wall.map((p, i) => (
        <mesh key={`w${i}`} position={p}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#ff2d55" />
        </mesh>
      ))}
    </group>
  );
}
