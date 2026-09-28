import { ANTENNA_PROFILES } from '../presets/profiles';
import { groundPreset } from '../rf/ground';
import { newId } from './ids';
import { boresight, DEG } from '../rf/math';
import { TrackPath } from '../rf/track';
import type { Antenna, Setup, Track, TrackSegment, Truss, TrussMember, Vec3 } from './types';

/** Truss member centre-line point in world coordinates. */
export function memberPoint(t: Truss, member: TrussMember, along: number): Vec3 {
  const half = t.spanM / 2;
  const local: Vec3 =
    member === 'left' ? [0, along, -half] : member === 'right' ? [0, along, half] : [0, t.heightM, along];
  const c = Math.cos(t.yawDeg * DEG), s = Math.sin(t.yawDeg * DEG);
  return [t.position[0] + local[0] * c + local[2] * s, t.position[1] + local[1], t.position[2] - local[0] * s + local[2] * c];
}

/** Inverse of memberPoint: project a world position onto the member (used when dragging). */
export function alongFromPosition(t: Truss, member: TrussMember, p: Vec3): number {
  const dx = p[0] - t.position[0], dz = p[2] - t.position[2];
  const c = Math.cos(t.yawDeg * DEG), s = Math.sin(t.yawDeg * DEG);
  const lz = dx * s + dz * c;
  const half = t.spanM / 2;
  if (member === 'top') return clamp(lz, -half, half);
  return clamp(p[1] - t.position[1], 0, t.heightM);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function mountedPosition(a: Antenna, t: Truss, depthM: number): Vec3 {
  const p = memberPoint(t, a.mount!.member, a.mount!.alongM);
  // the panel sits in front of the truss, on its boresight side
  const b = boresight(a.yawDeg, a.pitchDeg);
  const off = t.sectionM / 2 + depthM / 2 + 0.03;
  return [r3(p[0] + b[0] * off), r3(p[1] + b[1] * off), r3(p[2] + b[2] * off)];
}

/**
 * Derive dependent values after any edit: truss base elevation from the track, positions of
 * antennas mounted on a truss. Returns the same object when nothing changed.
 */
export function normalizeSetup(setup: Setup): Setup {
  let changed = false;
  let path: TrackPath | null = null;
  const trusses = setup.trusses.map((t) => {
    if (!t.followTrack) return t;
    path ??= new TrackPath(setup.track);
    const y = r3(path.elevation(path.nearestS(t.position[0], t.position[2])));
    if (y === t.position[1]) return t;
    changed = true;
    return { ...t, position: [t.position[0], y, t.position[2]] as Vec3 };
  });
  const obstacles = (setup.obstacles ?? []).map((o) => {
    if (o.base === 'manual') return o;
    let y = 0;
    if (o.base === 'track') {
      path ??= new TrackPath(setup.track);
      y = r3(path.elevation(path.nearestS(o.position[0], o.position[2])));
    }
    if (y === o.position[1]) return o;
    changed = true;
    return { ...o, position: [o.position[0], y, o.position[2]] as Vec3 };
  });
  const antennas = setup.antennas.map((a) => {
    if (!a.mount) return a;
    const t = trusses.find((x) => x.id === a.mount!.trussId);
    if (!t) {
      changed = true;
      return { ...a, mount: undefined };
    }
    const prof = setup.antennaProfiles.find((p) => p.id === a.profileId) ?? setup.antennaProfiles[0];
    const pos = mountedPosition(a, t, prof?.sizeM[2] ?? 0.04);
    if (pos.every((v, i) => v === a.position[i])) return a;
    changed = true;
    return { ...a, position: pos };
  });
  return changed ? { ...setup, trusses, antennas, obstacles } : setup;
}

// ---------------------------------------------------------------------------------------------
// Migration of version-1 files (single turn described by shape/radius/turnStart)

interface TrackV1 {
  widthM: number;
  shape: 'straight' | 'left' | 'right';
  radiusM: number;
  turnStartM: number;
  turnAngleDeg: number;
  lengthBeforeM: number;
  lengthAfterM: number;
}

const baseSeg = (kind: TrackSegment['kind'], p: Partial<TrackSegment> = {}): TrackSegment => ({
  id: newId('seg'),
  kind,
  lengthM: 10,
  radiusM: 12,
  angleDeg: 90,
  riseM: 0,
  widthM: 8,
  taper: false,
  ...p,
});

function migrateTrack(t: TrackV1): Track {
  const seg = (kind: TrackSegment['kind'], p: Partial<TrackSegment> = {}) => baseSeg(kind, { widthM: t.widthM, ...p });
  if (t.shape === 'straight') {
    const g = seg('straight', { lengthM: t.lengthBeforeM + t.lengthAfterM });
    return { widthM: t.widthM, startElevationM: 0, segments: [g], finishSegmentId: g.id, finishOffsetM: t.lengthBeforeM };
  }
  const arcLen = t.radiusM * t.turnAngleDeg * DEG;
  const before = seg('straight', { lengthM: Math.max(t.lengthBeforeM + t.turnStartM, 0.01) });
  const turn = seg(t.shape, { radiusM: t.radiusM, angleDeg: t.turnAngleDeg });
  const after = seg('straight', { lengthM: Math.max(t.lengthAfterM - t.turnStartM - arcLen, 1) });
  const segments = [before, turn, after];
  // finish at s=0 -> distance t.lengthBeforeM from the start
  let u = t.lengthBeforeM, finish = before;
  for (const g of segments) {
    const len = g.kind === 'straight' ? g.lengthM : g.radiusM * g.angleDeg * DEG;
    if (u <= len) { finish = g; break; }
    u -= len;
  }
  return { widthM: t.widthM, startElevationM: 0, segments, finishSegmentId: finish.id, finishOffsetM: Math.max(u, 0) };
}

/** Accepts version 1 and 2 setup files; returns a version-2 setup or throws. */
export function migrateSetup(raw: unknown): Setup {
  const s = raw as Setup & { version: number; track: Track | TrackV1 };
  if (!s || typeof s !== 'object' || !Array.isArray(s.antennas)) throw new Error('not a setup file');
  if (s.version === 2) return normalizeSetup(withSegmentWidths(withGround(s)));
  if (s.version !== 1) throw new Error(`unsupported setup version ${s.version}`);
  const track = migrateTrack(s.track as TrackV1);
  return normalizeSetup(withGround({
    ...s,
    version: 2,
    track,
    trusses: s.trusses.map((t) => ({ ...t, followTrack: true })),
    antennaProfiles: s.antennaProfiles?.length ? s.antennaProfiles : ANTENNA_PROFILES,
  }));
}

/** Early version-2 files had one width for the whole track. */
function withSegmentWidths(s: Setup): Setup {
  if (s.track.segments.every((g) => typeof g.widthM === 'number')) return s;
  return {
    ...s,
    track: { ...s.track, segments: s.track.segments.map((g) => ({ ...g, widthM: g.widthM ?? s.track.widthM, taper: g.taper ?? false })) },
  };
}

/** Older files had a single |Γ| value instead of a ground model. */
function withGround(s: Setup): Setup {
  const { groundGamma: _old, ...env } = s.env as Setup['env'] & { groundGamma?: number };
  return {
    ...s,
    obstacles: s.obstacles ?? [],
    sim: { ...s.sim, includeLanes: s.sim.includeLanes ?? true, lines: s.sim.lines ?? [], randomLines: s.sim.randomLines ?? 0 },
    env: {
      ...env,
      ground: env.ground ?? groundPreset('clay-moist'),
      terrainGround: env.terrainGround ?? groundPreset('grass'),
      terrainBlockDb: env.terrainBlockDb ?? 25,
    },
  };
}
