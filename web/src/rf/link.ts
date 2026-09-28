import type { Antenna, AntennaProfile, EnvSettings, Setup, TagAxis, TagProfile, Vec3 } from '../model/types';
import { dbToLin, linToDb, mulMatT, rotYXZ, wavelength, type Mat3 } from './math';
import { antennaGainDb, tagGainDb } from './pattern';

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
  return { antennas, tag: setup.tag, env: setup.env, lambda, k: (2 * Math.PI) / lambda };
}

export function tagAxisWorld(axis: TagAxis, dir: Vec3, right: Vec3): Vec3 {
  switch (axis) {
    case 'lateral':
      return right;
    case 'along':
      return dir;
    case 'vertical':
      return [0, 1, 0];
    default:
      return [0, 0, 1];
  }
}

export interface LinkResult {
  pTagDbm: number; // power delivered to the tag chip
  rssiDbm: number; // backscatter power at the reader
  margin: number; // min(forward margin, reverse margin), >= 0 means readable
}

/**
 * Channel power gain |h|^2 (linear) between antenna and tag: antenna gain * tag gain * free-space,
 * optionally plus a coherent ground-reflected ray (image method, reflection coefficient -gamma).
 */
export function channelGain(ctx: LinkCtx, a: AntennaCtx, tagPos: Vec3, axisW: Vec3): number {
  const { tag, lambda, k, env } = ctx;
  const path = (src: Vec3, dst: Vec3, reflect: boolean) => {
    const dx = dst[0] - src[0], dy = dst[1] - src[1], dz = dst[2] - src[2];
    const d = Math.max(Math.hypot(dx, dy, dz), 0.05);
    const u: Vec3 = [dx / d, dy / d, dz / d];
    // direction leaving the real antenna: for the reflected ray it heads towards the mirrored tag
    const local = mulMatT(a.rot, reflect ? [u[0], -u[1], u[2]] : u);
    const ga = antennaGainDb(a.profile, local);
    // direction arriving at the tag (from tag towards the source)
    const gt = tagGainDb(tag.gainDbi, tag.axis, axisW, [-u[0], -u[1], -u[2]]);
    const amp = Math.sqrt(dbToLin(ga + gt)) * (lambda / (4 * Math.PI * d));
    return { amp, phase: -k * d };
  };
  const direct = path(a.pos, tagPos, false);
  if (!env.groundReflection) return direct.amp * direct.amp;
  const image: Vec3 = [a.pos[0], -a.pos[1], a.pos[2]];
  const refl = path(image, tagPos, true);
  const g = env.groundGamma;
  const re = direct.amp * Math.cos(direct.phase) - g * refl.amp * Math.cos(refl.phase);
  const im = direct.amp * Math.sin(direct.phase) - g * refl.amp * Math.sin(refl.phase);
  return re * re + im * im;
}

export function evalLink(ctx: LinkCtx, a: AntennaCtx, tagPos: Vec3, axisW: Vec3): LinkResult {
  const { tag, env } = ctx;
  const hDb = linToDb(channelGain(ctx, a, tagPos, axisW));
  const lossOneWay = a.antenna.cableLossDb + tag.polLossDb + tag.bodyLossDb;
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
