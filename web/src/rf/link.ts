import type { Antenna, AntennaProfile, EnvSettings, Setup, TagAxis, TagProfile, Vec3 } from '../model/types';
import { dbToLin, linToDb, mulMatT, rotYXZ, wavelength, type Mat3 } from './math';
import { groundReflection } from './ground';
import { antennaGainDb, tagGainDb } from './pattern';
import { buildSceneGeom, obstacleLossDb, surfaceAt, throughTrackBody, type SceneGeom } from './sceneGeom';
import { finishElevation } from './track';

/** Precomputed per-antenna state for fast link evaluation. */
export interface AntennaCtx {
  antenna: Antenna;
  profile: AntennaProfile;
  rot: Mat3;
  pos: Vec3;
}

export interface LinkCtx {
  antennas: AntennaCtx[]; // enabled antennas only
  tag: TagProfile;
  env: EnvSettings;
  lambda: number;
  k: number;
  groundY: number; // track surface at the finish (first guess for reflection points)
  geom: SceneGeom; // track height map + obstacles
}

export function buildLinkCtx(setup: Setup, overrides?: { txDbm?: Record<string, number> }): LinkCtx {
  const lambda = wavelength(setup.env.freqMHz);
  const antennas = setup.antennas
    .filter((a) => a.enabled)
    .map((a) => {
      const profile = setup.antennaProfiles.find((p) => p.id === a.profileId) ?? setup.antennaProfiles[0];
      const tx = overrides?.txDbm?.[a.id];
      const antenna = tx === undefined ? a : { ...a, txDbm: tx };
      return { antenna, profile, rot: rotYXZ(a.yawDeg, a.pitchDeg, a.rollDeg), pos: a.position };
    });
  return { antennas, tag: setup.tag, env: setup.env, lambda, k: (2 * Math.PI) / lambda, groundY: finishElevation(setup.track), geom: buildSceneGeom(setup) };
}

/** Tag dipole axis in world coordinates from the bike's direction of travel and right side. */
export function tagAxisWorld(axis: TagAxis, dir: Vec3, right: Vec3, tiltBackDeg = 0): Vec3 {
  const t = (tiltBackDeg * Math.PI) / 180;
  switch (axis) {
    case 'lateral':
      return right;
    case 'along': // forward; tips up at the front when the mount leans back (same rotation as 'vertical')
      return [dir[0] * Math.cos(t), Math.sin(t), dir[2] * Math.cos(t)];
    case 'vertical': // up, leaning backwards (towards the rider) by the tilt
      return [-dir[0] * Math.sin(t), Math.cos(t), -dir[2] * Math.sin(t)];
    default:
      return [0, 0, 1];
  }
}

/** Tag orientation plus the bike frame used for body shadowing. */
export interface TagPose {
  axis: Vec3;
  fwd: Vec3;
  right: Vec3;
}

export const tagPose = (tag: TagProfile, dir: Vec3, right: Vec3): TagPose => ({
  axis: tagAxisWorld(tag.axis, dir, right, tag.tiltBackDeg ?? 0),
  fwd: dir,
  right,
});

const toPose = (p: TagPose | Vec3): TagPose => (Array.isArray(p) ? { axis: p, fwd: [1, 0, 0], right: [0, 0, 1] } : p);

/** Loss (dB) because the bike sits between the tag and the source; `toSrc` points from tag to source. */
export function bikeShadowDb(tag: TagProfile, pose: TagPose, toSrc: Vec3): number {
  const db = tag.shadowDb ?? 0;
  if (!db || !tag.side || tag.side === 'none') return 0;
  const r = toSrc[0] * pose.right[0] + toSrc[2] * pose.right[2];
  const f = toSrc[0] * pose.fwd[0] + toSrc[2] * pose.fwd[2];
  const x = tag.side === 'left' ? r : tag.side === 'right' ? -r : -f; // front: shadowed from behind
  return db * Math.min(1, Math.max(0, x) / 0.7);
}

export interface LinkResult {
  pTagDbm: number; // power delivered to the tag chip
  rssiDbm: number; // backscatter power at the reader
  margin: number; // min(forward margin, reverse margin), >= 0 means readable
}

/**
 * Channel power gain |h|^2 (linear) between antenna and tag: antenna gain * tag gain * free space
 * * obstacle / terrain losses, plus a coherent ray reflected off the local surface (track surface
 * or terrain beside it, each with its own ground material).
 */
export function channelGain(ctx: LinkCtx, a: AntennaCtx, tagPos: Vec3, poseIn: TagPose | Vec3, tag: TagProfile = ctx.tag): number {
  const { lambda, k, env, geom } = ctx;
  const pose = toPose(poseIn);
  const axisW = pose.axis;
  const path = (src: Vec3, dst: Vec3, reflect: boolean) => {
    const dx = dst[0] - src[0], dy = dst[1] - src[1], dz = dst[2] - src[2];
    const d = Math.max(Math.hypot(dx, dy, dz), 0.05);
    const u: Vec3 = [dx / d, dy / d, dz / d];
    // direction leaving the real antenna: for the reflected ray it heads towards the mirrored tag
    const local = mulMatT(a.rot, reflect ? [u[0], -u[1], u[2]] : u);
    const ga = antennaGainDb(a.profile, local);
    // direction arriving at the tag (from tag towards the source)
    const toSrc: Vec3 = [-u[0], -u[1], -u[2]];
    const gt = tagGainDb(tag.gainDbi, tag.axis, axisW, toSrc) - bikeShadowDb(tag, pose, toSrc);
    const amp = Math.sqrt(dbToLin(ga + gt)) * (lambda / (4 * Math.PI * d));
    return { amp, phase: -k * d };
  };
  const direct = path(a.pos, tagPos, false);
  let directLoss = obstacleLossDb(geom.boxes, a.pos, tagPos);
  if (throughTrackBody(geom.map, a.pos, tagPos)) directLoss += env.terrainBlockDb;
  const dAmp = direct.amp * Math.pow(10, -directLoss / 20);
  if (!env.groundReflection) return dAmp * dAmp;

  // specular point: start with the plane at the finish surface, then snap to the local surface
  let planeY = ctx.groundY;
  let refl: { y: number; onTrack: boolean; p: Vec3 } | null = null;
  for (let iter = 0; iter < 2; iter++) {
    const hA = a.pos[1] - planeY, hT = tagPos[1] - planeY;
    if (hA <= 0 || hT <= 0) { refl = null; break; }
    const t = hA / (hA + hT);
    const p: Vec3 = [a.pos[0] + (tagPos[0] - a.pos[0]) * t, planeY, a.pos[2] + (tagPos[2] - a.pos[2]) * t];
    const surf = surfaceAt(geom.map, p[0], p[2]);
    refl = { y: surf.y, onTrack: surf.onTrack, p: [p[0], surf.y, p[2]] };
    if (Math.abs(surf.y - planeY) < 0.02) break;
    planeY = surf.y;
  }
  if (!refl) return dAmp * dAmp;
  const hA = a.pos[1] - refl.y, hT = tagPos[1] - refl.y;
  if (hA <= 0 || hT <= 0) return dAmp * dAmp;
  const image: Vec3 = [a.pos[0], 2 * refl.y - a.pos[1], a.pos[2]];
  const r = path(image, tagPos, true);
  const reflLoss = Math.min(obstacleLossDb(geom.boxes, a.pos, refl.p) + obstacleLossDb(geom.boxes, refl.p, tagPos), 40);
  const dx = tagPos[0] - a.pos[0], dz = tagPos[2] - a.pos[2];
  const dh = Math.hypot(dx, dz);
  const d2 = Math.hypot(dh, hA + hT);
  // share of the tag field perpendicular to the plane of incidence (horizontal polarisation)
  let wTE = 0.5;
  if (tag.axis !== 'isotropic') {
    if (dh < 1e-6) wTE = Math.hypot(axisW[0], axisW[2]) ** 2;
    else {
      const n = [dz / dh, -dx / dh]; // horizontal normal of the plane of incidence
      wTE = (axisW[0] * n[0] + axisW[2] * n[1]) ** 2 / Math.max(1e-9, axisW[0] ** 2 + axisW[1] ** 2 + axisW[2] ** 2);
    }
  }
  const ground = refl.onTrack ? env.ground : env.terrainGround;
  const [gr, gi] = groundReflection(ground, (hA + hT) / d2, wTE, lambda);
  const rAmp = r.amp * Math.pow(10, -reflLoss / 20);
  const cr = Math.cos(r.phase), ci = Math.sin(r.phase);
  const re = dAmp * Math.cos(direct.phase) + rAmp * (gr * cr - gi * ci);
  const im = dAmp * Math.sin(direct.phase) + rAmp * (gr * ci + gi * cr);
  return re * re + im * im;
}

/**
 * Detuning of a dipole inlay (e.g. Dogbone) near metal, in dB per direction. Directly on metal the
 * antenna is practically shorted; a few centimetres of spacer recover most of the performance.
 * Typical values for 865–868 MHz dipole inlays – verify with the real holder.
 */
const METAL_CURVE: [number, number][] = [[0, 25], [2, 16], [5, 10], [10, 6], [20, 3], [40, 1], [80, 0]];
export function metalDetuneDb(tag: TagProfile): number {
  if (!tag.nearMetal) return 0;
  const g = Math.max(0, tag.metalGapMm ?? 0);
  for (let i = 1; i < METAL_CURVE.length; i++) {
    const [g1, l1] = METAL_CURVE[i];
    if (g <= g1) {
      const [g0, l0] = METAL_CURVE[i - 1];
      return l0 + ((l1 - l0) * (g - g0)) / (g1 - g0);
    }
  }
  return 0;
}

export function evalLink(ctx: LinkCtx, a: AntennaCtx, tagPos: Vec3, pose: TagPose | Vec3, tag: TagProfile = ctx.tag): LinkResult {
  const { env } = ctx;
  const hDb = linToDb(channelGain(ctx, a, tagPos, pose, tag));
  const lossOneWay = a.antenna.cableLossDb + tag.polLossDb + tag.bodyLossDb + metalDetuneDb(tag);
  const pTagDbm = a.antenna.txDbm - lossOneWay + hDb;
  const rssiDbm = a.antenna.txDbm - 2 * lossOneWay - tag.backscatterLossDb + 2 * hDb;
  const margin = Math.min(pTagDbm - tag.sensitivityDbm, rssiDbm - env.readerSensDbm);
  return { pTagDbm, rssiDbm, margin };
}

/** Linear-equivalent EIRP (circular dBic counted as dBil + 3 dB) for the ETSI 2 W ERP check. */
export function eirpLinearDbm(a: Antenna, p: AntennaProfile): number {
  const circ = p.polarization === 'linear' ? 0 : 3;
  return a.txDbm - a.cableLossDb + p.gainDbic - circ;
}
