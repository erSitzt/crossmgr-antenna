import type { Track, TrackSegment, Vec3 } from '../model/types';
import { DEG } from './math';

/**
 * Track centreline built from a chain of segments (straight / left arc / right arc), each with a
 * linear height change. Parametrised by arc length s (metres) with s = 0 at the finish line.
 * The path is placed so that the finish is at X = Z = 0 with heading +X; Y is the absolute
 * track elevation. A left turn rotates the heading towards -Z, a right turn towards +Z.
 * Beyond both ends the track continues straight and level so simulations never run off the end.
 */
export interface TrackSample {
  s: number;
  pos: Vec3; // centreline point on the track surface (Y = elevation)
  dir: Vec3; // unit tangent (horizontal)
  right: Vec3; // unit normal pointing to the rider's right
}

const EXTEND = 60;

export const segmentLength = (g: TrackSegment) =>
  g.kind === 'straight' ? Math.max(g.lengthM, 0) : Math.max(g.radiusM, 0.5) * Math.max(g.angleDeg, 0) * DEG;

const curvature = (g: TrackSegment) =>
  g.kind === 'straight' ? 0 : (g.kind === 'left' ? 1 : -1) / Math.max(g.radiusM, 0.5);

/** Arc-length position (from the start of the first segment) where each segment starts. */
export function segmentStarts(track: Track): number[] {
  const out: number[] = [];
  let u = 0;
  for (const g of track.segments) {
    out.push(u);
    u += segmentLength(g);
  }
  return out;
}

export function totalLength(track: Track): number {
  return track.segments.reduce((a, g) => a + segmentLength(g), 0);
}

/** Arc length of the finish line measured from the start of the first segment. */
export function finishU(track: Track): number {
  const starts = segmentStarts(track);
  const i = Math.max(0, track.segments.findIndex((g) => g.id === track.finishSegmentId));
  const g = track.segments[i];
  if (!g) return 0;
  return starts[i] + Math.min(Math.max(track.finishOffsetM, 0), segmentLength(g));
}

/** Elevation at arc length u (from the start of the first segment). */
export function elevationAtU(track: Track, u: number): number {
  let e = track.startElevationM;
  let start = 0;
  for (const g of track.segments) {
    const len = segmentLength(g);
    if (u <= start + len) {
      return len > 0 ? e + (g.riseM * Math.max(u - start, 0)) / len : e;
    }
    e += g.riseM;
    start += len;
  }
  return e;
}

export const finishElevation = (track: Track) => elevationAtU(track, finishU(track));

/** Track width at arc length u (from the start of the first segment). */
export function widthAtU(track: Track, u: number): number {
  let w = track.widthM;
  let start = 0;
  for (const g of track.segments) {
    const len = segmentLength(g);
    const target = g.widthM ?? w;
    if (u <= start + len) {
      if (!g.taper || len <= 0) return target;
      return w + ((target - w) * Math.max(u - start, 0)) / len;
    }
    w = target;
    start += len;
  }
  return w;
}

export const finishWidth = (track: Track) => widthAtU(track, finishU(track));

/** Widest point of the track within ±range metres of the finish (sizes the field views). */
export function maxWidthNearFinish(track: Track, range = 15): number {
  const f = finishU(track);
  let w = 0;
  for (let u = f - range; u <= f + range; u += 0.5) w = Math.max(w, widthAtU(track, u));
  return w;
}

export class TrackPath {
  private readonly ds = 0.05;
  private readonly u0: number; // arc length of the first sample
  private readonly uFinish: number;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  private readonly ys: Float64Array;
  private readonly hs: Float64Array;

  constructor(public readonly track: Track) {
    const L = totalLength(track);
    this.u0 = -EXTEND;
    this.uFinish = finishU(track);
    const n = Math.ceil((L + 2 * EXTEND) / this.ds) + 1;
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.hs = new Float64Array(n);

    // curvature lookup per sample
    const starts = segmentStarts(track);
    const kAt = (u: number) => {
      for (let i = track.segments.length - 1; i >= 0; i--)
        if (u >= starts[i]) return u < starts[i] + segmentLength(track.segments[i]) ? curvature(track.segments[i]) : 0;
      return 0;
    };
    let h = 0, x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const u = this.u0 + i * this.ds;
      if (i > 0) {
        const hm = h + (kAt(u - this.ds / 2) * this.ds) / 2;
        x += Math.cos(hm) * this.ds;
        z -= Math.sin(hm) * this.ds;
        h += kAt(u - this.ds / 2) * this.ds;
      }
      this.xs[i] = x; this.zs[i] = z; this.hs[i] = h;
      this.ys[i] = elevationAtU(track, u);
    }
    // move the finish to the origin with heading 0
    const fi = (this.uFinish - this.u0) / this.ds;
    const fx = this.interp(this.xs, fi), fz = this.interp(this.zs, fi), fh = this.interp(this.hs, fi);
    const c = Math.cos(fh), sn = Math.sin(fh);
    for (let i = 0; i < n; i++) {
      const dx = this.xs[i] - fx, dz = this.zs[i] - fz;
      // rotate by +fh about Y (heading fh -> 0): heading vector (cos h, -sin h)
      this.xs[i] = dx * c - dz * sn;
      this.zs[i] = dx * sn + dz * c;
      this.hs[i] -= fh;
    }
  }

  private interp(a: Float64Array, f: number): number {
    const fc = Math.min(Math.max(f, 0), a.length - 1.000001);
    const i = Math.floor(fc), t = fc - i;
    return a[i] * (1 - t) + a[i + 1] * t;
  }

  private idx(s: number) {
    return (s + this.uFinish - this.u0) / this.ds;
  }

  get minS() {
    return this.u0 - this.uFinish;
  }
  get maxS() {
    return this.u0 + (this.xs.length - 1) * this.ds - this.uFinish;
  }
  /** s of the start / end of the configured segments (without the straight extensions). */
  get trackStartS() {
    return -this.uFinish;
  }
  get trackEndS() {
    return totalLength(this.track) - this.uFinish;
  }

  elevation(s: number): number {
    return this.interp(this.ys, this.idx(s));
  }

  width(s: number): number {
    return widthAtU(this.track, s + this.uFinish);
  }

  /** Point on a lane given as a fraction of the local width (-0.5 = left edge, +0.5 = right edge). */
  lanePoint(s: number, frac: number, height: number): Vec3 {
    return this.point(s, frac * this.width(s), height);
  }

  sample(s: number): TrackSample {
    const f = this.idx(s);
    const h = this.interp(this.hs, f);
    return {
      s,
      pos: [this.interp(this.xs, f), this.interp(this.ys, f), this.interp(this.zs, f)],
      dir: [Math.cos(h), 0, -Math.sin(h)],
      right: [Math.sin(h), 0, Math.cos(h)],
    };
  }

  /** Point at arc length s, lateral offset (positive = right) and height above the track surface. */
  point(s: number, lateral: number, height: number): Vec3 {
    const smp = this.sample(s);
    return [smp.pos[0] + smp.right[0] * lateral, smp.pos[1] + height, smp.pos[2] + smp.right[2] * lateral];
  }

  /** Arc length of the centreline point closest to (x, z) in plan view. */
  nearestS(x: number, z: number): number {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.xs.length; i += 4) {
      const d = (this.xs[i] - x) ** 2 + (this.zs[i] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return this.u0 + best * this.ds - this.uFinish;
  }
}
