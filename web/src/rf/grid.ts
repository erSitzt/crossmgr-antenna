import type { Setup, Vec3 } from '../model/types';
import { buildLinkCtx, evalLink, tagPose } from './link';
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
  const axisW = tagPose(setup.tag, DIR, RIGHT);
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
  withLimit?: boolean; // also classify what limits the read at each point (3× slower)
}

/** What limits the read at a point (best antenna). */
export const LIMIT = {
  readable: 0,
  mounting: 1, // an ideal tag (no orientation null, bike shadow or metal) would be read
  obstacles: 2, // without obstacles / the raised track body it would be read
  notPowered: 3, // forward link: the tag does not get enough power
  replyWeak: 4, // reverse link: the reply is below the reader's Rx sensitivity
} as const;

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
  limit: Uint8Array | null; // LIMIT code per point when requested
}

export function computeSlice(setup: Setup, spec: SliceSpec): SliceData {
  const ctx = buildLinkCtx(setup);
  const axisW = tagPose(setup.tag, DIR, RIGHT);
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
    limit: spec.withLimit ? classifyLimits(setup, spec, uMin, vMin, nu, nv, margin) : null,
  };
}

function classifyLimits(setup: Setup, spec: SliceSpec, uMin: number, vMin: number, nu: number, nv: number, margin: Float32Array[]): Uint8Array {
  // ideal tag: no dipole null, no bike shadow, no metal – same sensitivity, gain and losses otherwise
  const ideal = { ...setup.tag, axis: 'isotropic' as const, side: 'none' as const, shadowDb: 0, nearMetal: false };
  const ctxIdeal = buildLinkCtx({ ...setup, tag: ideal });
  const ctxClear = buildLinkCtx({ ...setup, tag: ideal, obstacles: [], env: { ...setup.env, terrainBlockDb: 0 } });
  const poseIdeal = tagPose(ideal, DIR, RIGHT);
  const out = new Uint8Array(nu * nv);
  for (let v = 0; v < nv; v++)
    for (let u = 0; u < nu; u++) {
      const i = u + nu * v;
      if (margin.some((m) => m[i] >= 0)) continue; // readable
      const uu = uMin + u * spec.step, vv = vMin + v * spec.step;
      const p: Vec3 = spec.kind === 'horizontal' ? [uu, spec.at, vv] : [spec.at, vv, uu];
      if (ctxIdeal.antennas.some((a) => evalLink(ctxIdeal, a, p, poseIdeal).margin >= 0)) { out[i] = LIMIT.mounting; continue; }
      let best: { margin: number; fwd: number; rev: number } | null = null;
      for (const a of ctxClear.antennas) {
        const r = evalLink(ctxClear, a, p, poseIdeal);
        if (!best || r.margin > best.margin)
          best = { margin: r.margin, fwd: r.pTagDbm - ideal.sensitivityDbm, rev: r.rssiDbm - setup.env.readerSensDbm };
      }
      if (best && best.margin >= 0) out[i] = LIMIT.obstacles;
      else if (best && best.fwd < best.rev) out[i] = LIMIT.notPowered;
      else out[i] = LIMIT.replyWeak;
    }
  return out;
}
