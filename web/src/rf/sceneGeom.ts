import type { Obstacle, Setup, Track, Vec3 } from '../model/types';
import { MAX_OBSTACLE_LOSS_DB } from '../presets/obstacles';
import { DEG } from './math';
import { maxWidthNearFinish, TrackPath } from './track';

/**
 * Plan-view height map of the track around the finish: cells covered by the track carry the
 * track surface elevation, everything else is terrain at Y = 0.
 */
export interface SurfaceMap {
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  height: Float32Array;
  onTrack: Uint8Array;
  maxY: number; // highest track surface (0 = flat track, no blocking possible)
}

const RANGE_X = 45;
const cache = new WeakMap<Track, SurfaceMap>();

export function surfaceMap(track: Track): SurfaceMap {
  const hit = cache.get(track);
  if (hit) return hit;
  const step = 0.25;
  const halfZ = maxWidthNearFinish(track, RANGE_X) / 2 + 30;
  const x0 = -RANGE_X - 10, z0 = -halfZ;
  const nx = Math.ceil((2 * RANGE_X + 20) / step) + 1;
  const nz = Math.ceil((2 * halfZ) / step) + 1;
  const height = new Float32Array(nx * nz);
  const onTrack = new Uint8Array(nx * nz);
  const path = new TrackPath(track);
  const sMin = Math.max(path.minS, -RANGE_X - 30), sMax = Math.min(path.maxS, RANGE_X + 30);
  for (let s = sMin; s <= sMax; s += 0.1) {
    const smp = path.sample(s);
    const half = path.width(s) / 2;
    for (let l = -half; l <= half + 1e-6; l += 0.1) {
      const x = smp.pos[0] + smp.right[0] * l, z = smp.pos[2] + smp.right[2] * l;
      const i = Math.round((x - x0) / step), k = Math.round((z - z0) / step);
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const c = i + nx * k;
      if (!onTrack[c] || smp.pos[1] > height[c]) height[c] = smp.pos[1];
      onTrack[c] = 1;
    }
  }
  let maxY = 0;
  for (let c = 0; c < height.length; c++) if (onTrack[c] && height[c] > maxY) maxY = height[c];
  const map = { x0, z0, step, nx, nz, height, onTrack, maxY };
  cache.set(track, map);
  return map;
}

export function surfaceAt(m: SurfaceMap, x: number, z: number): { y: number; onTrack: boolean } {
  const i = Math.round((x - m.x0) / m.step), k = Math.round((z - m.z0) / m.step);
  if (i < 0 || k < 0 || i >= m.nx || k >= m.nz) return { y: 0, onTrack: false };
  const c = i + m.nx * k;
  return { y: m.height[c], onTrack: m.onTrack[c] === 1 };
}

/** True when the straight segment p0→p1 passes through the track body (below a raised surface). */
export function throughTrackBody(m: SurfaceMap, p0: Vec3, p1: Vec3): boolean {
  if (m.maxY <= 0.05 || Math.min(p0[1], p1[1]) >= m.maxY) return false;
  const N = 16;
  for (let n = 1; n < N; n++) {
    const t = n / N;
    const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t, z = p0[2] + (p1[2] - p0[2]) * t;
    const s = surfaceAt(m, x, z);
    if (s.onTrack && s.y > 0.05 && y < s.y - 0.05) return true;
  }
  return false;
}

/** Obstacle as an oriented box, ready for fast segment tests. */
export interface ObstacleBox {
  c: Vec3; // box centre
  half: Vec3; // half extents in local axes
  cos: number;
  sin: number;
  fixedDb: number;
  perMeterDb: number;
}

export function obstacleBoxes(obstacles: Obstacle[]): ObstacleBox[] {
  return obstacles.map((o) => {
    const [w, h, d] = o.sizeM;
    return {
      c: [o.position[0], o.position[1] + o.liftM + h / 2, o.position[2]],
      half: [(w * Math.max(1, o.count)) / 2, h / 2, Math.max(d, 0.01) / 2],
      cos: Math.cos(o.yawDeg * DEG),
      sin: Math.sin(o.yawDeg * DEG),
      fixedDb: o.fixedDb,
      perMeterDb: o.perMeterDb,
    };
  });
}

/** Loss (dB) of the segment p0→p1 through all obstacles (slab test in each box's local frame). */
export function obstacleLossDb(boxes: ObstacleBox[], p0: Vec3, p1: Vec3): number {
  let loss = 0;
  for (const b of boxes) {
    // world -> local (inverse yaw rotation about Y)
    const lx = (v: Vec3) => (v[0] - b.c[0]) * b.cos - (v[2] - b.c[2]) * b.sin;
    const lz = (v: Vec3) => (v[0] - b.c[0]) * b.sin + (v[2] - b.c[2]) * b.cos;
    const a: Vec3 = [lx(p0), p0[1] - b.c[1], lz(p0)];
    const e: Vec3 = [lx(p1), p1[1] - b.c[1], lz(p1)];
    let t0 = 0, t1 = 1;
    let inside = true;
    for (let k = 0; k < 3 && inside; k++) {
      const d = e[k] - a[k];
      if (Math.abs(d) < 1e-12) {
        if (Math.abs(a[k]) > b.half[k]) inside = false;
        continue;
      }
      let ta = (-b.half[k] - a[k]) / d, tb = (b.half[k] - a[k]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) inside = false;
    }
    if (!inside) continue;
    const len = (t1 - t0) * Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
    loss += b.fixedDb + b.perMeterDb * len;
  }
  return Math.min(loss, MAX_OBSTACLE_LOSS_DB);
}

export interface SceneGeom {
  map: SurfaceMap;
  boxes: ObstacleBox[];
}

export const buildSceneGeom = (setup: Setup): SceneGeom => ({
  map: surfaceMap(setup.track),
  boxes: obstacleBoxes(setup.obstacles ?? []),
});
