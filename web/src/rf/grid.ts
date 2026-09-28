import type { Setup, Vec3 } from '../model/types';
import { buildLinkCtx, evalLink, tagAxisWorld } from './link';
import { surfaceNets } from './surfaceNets';
import { finishElevation, maxWidthNearFinish } from './track';

export interface VolumeSpec {
  origin: Vec3;
  step: number;
  dims: [number, number, number];
}

/** Region around the finish line that covers the track width plus side margins. */
export function defaultVolume(setup: Setup, step = 0.2): VolumeSpec {
  const halfW = maxWidthNearFinish(setup.track) / 2 + 4;
  const xMin = -14, xMax = 14;
  const [yMin, yMax] = verticalRange(setup);
  return {
    origin: [xMin, yMin, -halfW],
    step,
    dims: [
      Math.round((xMax - xMin) / step) + 1,
      Math.round((yMax - yMin) / step) + 1,
      Math.round((2 * halfW) / step) + 1,
    ],
  };
}

/** Vertical extent of the field views: from just below the finish surface to above the arch. */
export function verticalRange(setup: Setup): [number, number] {
  const fe = finishElevation(setup.track);
  const top = Math.max(fe + 5.5, ...setup.trusses.map((t) => t.position[1] + t.heightM + 0.5));
  return [Math.min(0, fe - 0.5), top];
}

// For the field views the tag is assumed to travel along +X (straight through the finish).
const DIR: Vec3 = [1, 0, 0];
const RIGHT: Vec3 = [0, 0, 1];

export interface ZoneMesh {
  antennaId: string;
  positions: Float32Array;
  indices: Uint32Array;
}

export function computeZones(setup: Setup, vol: VolumeSpec): ZoneMesh[] {
  const ctx = buildLinkCtx(setup);
  const axisW = tagAxisWorld(setup.tag.axis, DIR, RIGHT);
  const [nx, ny, nz] = vol.dims;
  const out: ZoneMesh[] = [];
  for (const a of ctx.antennas) {
    const field = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const p: Vec3 = [vol.origin[0] + i * vol.step, vol.origin[1] + j * vol.step, vol.origin[2] + k * vol.step];
          field[i + nx * (j + ny * k)] = evalLink(ctx, a, p, axisW).margin;
        }
    const mesh = surfaceNets(field, vol.dims, vol.origin, vol.step, 0);
    out.push({ antennaId: a.antenna.id, ...mesh });
  }
  return out;
}

export interface SliceSpec {
  kind: 'horizontal' | 'finish';
  /** horizontal: absolute elevation (Y). finish: X position of the vertical plane. */
  at: number;
  step: number;
}

export interface SliceData {
  spec: SliceSpec;
  // horizontal: u = X, v = Z ; finish: u = Z, v = Y
  uMin: number;
  vMin: number;
  nu: number;
  nv: number;
  step: number;
  antennaIds: string[];
  margin: Float32Array[]; // per antenna, index u + nu * v
  rssi: Float32Array[];
}

export function computeSlice(setup: Setup, spec: SliceSpec): SliceData {
  const ctx = buildLinkCtx(setup);
  const axisW = tagAxisWorld(setup.tag.axis, DIR, RIGHT);
  const halfW = maxWidthNearFinish(setup.track) / 2 + 4;
  let uMin: number, vMin: number, uLen: number, vLen: number;
  if (spec.kind === 'horizontal') {
    uMin = -14; uLen = 28; vMin = -halfW; vLen = 2 * halfW;
  } else {
    const [yMin, yMax] = verticalRange(setup);
    uMin = -halfW; uLen = 2 * halfW; vMin = yMin; vLen = yMax - yMin;
  }
  const nu = Math.round(uLen / spec.step) + 1;
  const nv = Math.round(vLen / spec.step) + 1;
  const margin: Float32Array[] = [];
  const rssi: Float32Array[] = [];
  for (const a of ctx.antennas) {
    const m = new Float32Array(nu * nv);
    const r = new Float32Array(nu * nv);
    for (let v = 0; v < nv; v++)
      for (let u = 0; u < nu; u++) {
        const uu = uMin + u * spec.step, vv = vMin + v * spec.step;
        const p: Vec3 = spec.kind === 'horizontal' ? [uu, spec.at, vv] : [spec.at, vv, uu];
        const res = evalLink(ctx, a, p, axisW);
        m[u + nu * v] = res.margin;
        r[u + nu * v] = res.rssiDbm;
      }
    margin.push(m);
    rssi.push(r);
  }
  return {
    spec, uMin, vMin, nu, nv, step: spec.step,
    antennaIds: ctx.antennas.map((a) => a.antenna.id),
    margin, rssi,
  };
}
