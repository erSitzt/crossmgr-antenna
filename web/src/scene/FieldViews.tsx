import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Setup } from '../model/types';
import type { SliceData, ZoneMesh } from '../rf/grid';
import { portColor, type SliceMode } from '../store';

export function ReadZones({ zones, setup, opacity }: { zones: ZoneMesh[]; setup: Setup; opacity: number }) {
  const geos = useMemo(
    () =>
      zones.map((z) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(z.positions, 3));
        g.setIndex(new THREE.BufferAttribute(z.indices, 1));
        g.computeVertexNormals();
        return { id: z.antennaId, g };
      }),
    [zones],
  );
  useEffect(() => () => geos.forEach((x) => x.g.dispose()), [geos]);
  return (
    <group>
      {geos.map(({ id, g }) => {
        const ant = setup.antennas.find((a) => a.id === id);
        if (!ant) return null;
        const c = portColor(ant.port);
        return (
          <group key={id}>
            <mesh geometry={g} renderOrder={2}>
              <meshStandardMaterial color={c} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={g} renderOrder={3}>
              <meshBasicMaterial color={c} wireframe transparent opacity={opacity * 0.35} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// viridis-like ramp
const RAMP = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
function ramp(t: number): [number, number, number] {
  const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2);
  const f = x - i;
  return [0, 1, 2].map((k) => RAMP[i][k] * (1 - f) + RAMP[i + 1][k] * f) as [number, number, number];
}
const OVERLAP = ['#000000', '#4c78a8', '#54a24b', '#f58518', '#e45756'];

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function sliceToRgba(d: SliceData, mode: SliceMode, ports: number[], readerSens: number, flipV: boolean) {
  const data = new Uint8Array(d.nu * d.nv * 4);
  const nA = d.margin.length;
  for (let v = 0; v < d.nv; v++)
    for (let u = 0; u < d.nu; u++) {
      const i = u + d.nu * v;
      let best = -Infinity, bestA = -1, count = 0, bestRssi = -Infinity;
      for (let a = 0; a < nA; a++) {
        const m = d.margin[a][i];
        if (m > best) best = m;
        if (m >= 0) {
          count++;
          if (d.rssi[a][i] > bestRssi) { bestRssi = d.rssi[a][i]; bestA = a; }
        }
      }
      let rgb: [number, number, number] = [0, 0, 0];
      let alpha = 0;
      if (count > 0) {
        alpha = 255;
        if (mode === 'margin') rgb = ramp(best / 20);
        else if (mode === 'rssi') rgb = ramp((bestRssi - readerSens) / (-30 - readerSens));
        else if (mode === 'overlap') rgb = hexRgb(OVERLAP[Math.min(count, 4)]);
        else rgb = hexRgb(portColor(ports[bestA]));
      }
      const row = flipV ? d.nv - 1 - v : v;
      const o = (u + d.nu * row) * 4;
      data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = alpha;
    }
  return data;
}

export function SliceView({
  data, mode, setup, opacity,
}: { data: SliceData; mode: SliceMode; setup: Setup; opacity: number }) {
  const horizontal = data.spec.kind === 'horizontal';
  const texture = useMemo(() => {
    const ports = data.antennaIds.map((id) => setup.antennas.find((a) => a.id === id)?.port ?? 0);
    const rgba = sliceToRgba(data, mode, ports, setup.env.readerSensDbm, horizontal);
    const t = new THREE.DataTexture(rgba, data.nu, data.nv, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, [data, mode, setup.antennas, setup.env.readerSensDbm, horizontal]);
  useEffect(() => () => texture.dispose(), [texture]);

  const w = (data.nu - 1) * data.step;
  const h = (data.nv - 1) * data.step;
  if (horizontal) {
    // u = X, v = Z ; plane rotated flat: local +y -> world -Z (hence flipV)
    return (
      <mesh position={[data.uMin + w / 2, data.spec.at, data.vMin + h / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    );
  }
  // u = Z, v = Y ; plane rotated -90° about Y: local +x -> world +Z
  return (
    <mesh position={[data.spec.at, data.vMin + h / 2, data.uMin + w / 2]} rotation={[0, -Math.PI / 2, 0]} renderOrder={1}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}
