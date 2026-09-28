import type { Track, Vec3 } from '../model/types';
import { DEG } from './math';

/**
 * Track centreline parametrised by arc length s (metres), s = 0 at the finish line.
 * Heading at the finish is always +X, so the finish plane is X = 0 locally.
 * A left turn rotates the heading towards -Z, a right turn towards +Z.
 */
export interface TrackSample {
  s: number;
  pos: Vec3; // centreline point at ground level
  dir: Vec3; // unit tangent
  right: Vec3; // unit normal pointing to the rider's right
}

function headingAt(track: Track, s: number): number {
  if (track.shape === 'straight') return 0;
  const sign = track.shape === 'left' ? 1 : -1;
  const maxA = track.turnAngleDeg * DEG;
  const a = (x: number) => Math.min(Math.max((x - track.turnStartM) / track.radiusM, 0), maxA);
  return sign * (a(s) - a(0));
}

const dirFromHeading = (h: number): Vec3 => [Math.cos(h), 0, -Math.sin(h)];
const rightFromHeading = (h: number): Vec3 => [Math.sin(h), 0, Math.cos(h)];

export class TrackPath {
  private readonly ds = 0.05;
  private readonly s0: number;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;

  constructor(public readonly track: Track) {
    this.s0 = -track.lengthBeforeM;
    const n = Math.ceil((track.lengthAfterM + track.lengthBeforeM) / this.ds) + 1;
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    const i0 = Math.round(-this.s0 / this.ds);
    // integrate forward and backward from the finish (origin)
    for (let i = i0 + 1; i < n; i++) {
      const h = headingAt(track, this.s0 + (i - 0.5) * this.ds);
      this.xs[i] = this.xs[i - 1] + Math.cos(h) * this.ds;
      this.zs[i] = this.zs[i - 1] - Math.sin(h) * this.ds;
    }
    for (let i = i0 - 1; i >= 0; i--) {
      const h = headingAt(track, this.s0 + (i + 0.5) * this.ds);
      this.xs[i] = this.xs[i + 1] - Math.cos(h) * this.ds;
      this.zs[i] = this.zs[i + 1] + Math.sin(h) * this.ds;
    }
  }

  get minS() {
    return this.s0;
  }
  get maxS() {
    return this.s0 + (this.xs.length - 1) * this.ds;
  }

  sample(s: number): TrackSample {
    const f = Math.min(Math.max((s - this.s0) / this.ds, 0), this.xs.length - 1.0001);
    const i = Math.floor(f);
    const t = f - i;
    const h = headingAt(this.track, s);
    return {
      s,
      pos: [this.xs[i] * (1 - t) + this.xs[i + 1] * t, 0, this.zs[i] * (1 - t) + this.zs[i + 1] * t],
      dir: dirFromHeading(h),
      right: rightFromHeading(h),
    };
  }

  /** Point at arc length s, lateral offset (positive = right) and height. */
  point(s: number, lateral: number, height: number): Vec3 {
    const smp = this.sample(s);
    return [smp.pos[0] + smp.right[0] * lateral, height, smp.pos[2] + smp.right[2] * lateral];
  }
}
