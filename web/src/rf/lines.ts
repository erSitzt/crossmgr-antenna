import type { LinePoint, RiderLine, Setup, Vec3 } from '../model/types';
import { makeRng } from './rng';
import { finishWidth, TrackPath } from './track';

/**
 * A rider trajectory: lateral position as a fraction of the local track width
 * (-0.5 = left edge, +0.5 = right edge, in direction of travel) at arc lengths s (0 = finish).
 * Between points the rider moves smoothly (smoothstep); outside them the position is held.
 */
export interface Trajectory {
  id: string;
  label: string;
  kind: 'lane' | 'line' | 'random';
  points: LinePoint[];
}

export function fracAt(tr: Trajectory, s: number): number {
  const p = tr.points;
  if (p.length === 0) return 0;
  if (s <= p[0].sM) return p[0].frac;
  for (let i = 1; i < p.length; i++) {
    if (s <= p[i].sM) {
      const span = p[i].sM - p[i - 1].sM;
      const t = span > 0 ? (s - p[i - 1].sM) / span : 1;
      const k = t * t * (3 - 2 * t);
      return p[i - 1].frac + (p[i].frac - p[i - 1].frac) * k;
    }
  }
  return p[p.length - 1].frac;
}

export interface TrajState {
  pos: Vec3; // tag position
  dir: Vec3; // actual horizontal direction of motion
  right: Vec3;
}

export function trajPoint(path: TrackPath, tr: Trajectory, s: number, height: number): Vec3 {
  return path.lanePoint(s, fracAt(tr, s), height);
}

export function trajState(path: TrackPath, tr: Trajectory, s: number, height: number): TrajState {
  const pos = trajPoint(path, tr, s, height);
  const a = trajPoint(path, tr, s - 0.05, height), b = trajPoint(path, tr, s + 0.05, height);
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const l = Math.hypot(dx, dz) || 1;
  const dir: Vec3 = [dx / l, 0, dz / l];
  return { pos, dir, right: [-dir[2], 0, dir[0]] };
}

/** Arc length at which the trajectory crosses the finish plane X = 0 (from -X to +X). */
export function crossingS(path: TrackPath, tr: Trajectory): number {
  const x = (s: number) => trajPoint(path, tr, s, 0)[0];
  let lo = -15, hi = 15;
  // find the first sign change scanning forward
  let prev = x(lo);
  for (let s = lo + 0.25; s <= hi; s += 0.25) {
    const cur = x(s);
    if (prev < 0 && cur >= 0) {
      lo = s - 0.25;
      hi = s;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        if (x(m) < 0) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    }
    prev = cur;
  }
  return 0;
}

export function laneOffsets(widthM: number, lanes: number): number[] {
  if (lanes <= 1) return [0];
  const edge = Math.min(0.5, widthM / 4);
  return Array.from({ length: lanes }, (_, i) => -widthM / 2 + edge + (i * (widthM - 2 * edge)) / (lanes - 1));
}

/** All trajectories the pass simulation runs: straight lanes, custom rider lines, random lines. */
export function buildTrajectories(setup: Setup): Trajectory[] {
  const { sim } = setup;
  const out: Trajectory[] = [];
  if (sim.includeLanes ?? true) {
    const fw = finishWidth(setup.track);
    laneOffsets(fw, sim.lanes).forEach((lat, i) =>
      out.push({ id: `lane-${i}`, label: `Lane ${lat > 0 ? '+' : ''}${lat.toFixed(1)} m`, kind: 'lane', points: [{ sM: 0, frac: lat / fw }] }),
    );
  }
  for (const l of sim.lines ?? []) {
    if (!l.enabled || l.points.length === 0) continue;
    out.push({ id: l.id, label: l.name, kind: 'line', points: [...l.points].sort((a, b) => a.sM - b.sM) });
  }
  const n = sim.randomLines ?? 0;
  if (n > 0) {
    const rng = makeRng(sim.seed * 7919 + 17);
    const r = sim.rangeM;
    const u = () => (rng.next() - 0.5) * 0.9;
    for (let i = 0; i < n; i++) {
      out.push({
        id: `rnd-${i}`,
        label: `Random ${i + 1}`,
        kind: 'random',
        points: [{ sM: -r, frac: u() }, { sM: -r / 3, frac: u() }, { sM: 0, frac: u() }, { sM: r / 2, frac: u() }],
      });
    }
  }
  return out;
}

export const LINE_PRESETS: { id: string; name: string; points: LinePoint[] }[] = [
  {
    id: 'cut-right-left',
    name: 'Corner cut: right edge → crosses left',
    points: [{ sM: -20, frac: 0.45 }, { sM: -8, frac: 0.35 }, { sM: 0, frac: -0.38 }, { sM: 8, frac: -0.3 }],
  },
  {
    id: 'cut-left-right',
    name: 'Corner cut: left edge → crosses right',
    points: [{ sM: -20, frac: -0.45 }, { sM: -8, frac: -0.35 }, { sM: 0, frac: 0.38 }, { sM: 8, frac: 0.3 }],
  },
  {
    id: 'hug-left',
    name: 'Tight on the left edge',
    points: [{ sM: -15, frac: -0.2 }, { sM: -5, frac: -0.47 }, { sM: 5, frac: -0.47 }],
  },
  {
    id: 'swing-wide',
    name: 'Swing wide right, back to centre',
    points: [{ sM: -15, frac: 0 }, { sM: -4, frac: 0.47 }, { sM: 6, frac: 0 }],
  },
];

export function makeLine(presetId: string, id: string): RiderLine {
  const p = LINE_PRESETS.find((x) => x.id === presetId) ?? LINE_PRESETS[0];
  return { id, name: p.name, enabled: true, points: p.points.map((q) => ({ ...q })) };
}
