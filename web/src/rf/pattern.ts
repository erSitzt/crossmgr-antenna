import type { AntennaProfile, TagAxis, Vec3 } from '../model/types';
import { DEG } from './math';

/**
 * Antenna gain (dBi) towards a direction given in the antenna's local frame
 * (local +Z = boresight, +X = azimuth plane, +Y = elevation plane).
 * 3GPP-style parabolic-in-dB main lobe, floored by the front-to-back ratio.
 */
export function antennaGainDb(p: AntennaProfile, local: Vec3): number {
  const [x, y, z] = local;
  const r = Math.hypot(x, y, z) || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, z / r))); // off-boresight angle
  const rho = Math.hypot(x, y);
  const cosPhi = rho > 1e-9 ? x / rho : 1;
  const sinPhi = rho > 1e-9 ? y / rho : 0;
  const az = p.hpbwAzDeg * DEG;
  const el = p.hpbwElDeg * DEG;
  const att = 12 * theta * theta * ((cosPhi * cosPhi) / (az * az) + (sinPhi * sinPhi) / (el * el));
  return p.gainDbic - Math.min(att, p.frontToBackDb);
}

/** Tag dipole gain (dBi) towards a unit direction, given the dipole axis in world coordinates. */
export function tagGainDb(gainDbi: number, axis: TagAxis, axisWorld: Vec3, dirUnit: Vec3): number {
  if (axis === 'isotropic') return gainDbi;
  const c = axisWorld[0] * dirUnit[0] + axisWorld[1] * dirUnit[1] + axisWorld[2] * dirUnit[2];
  const sin2 = Math.max(1 - c * c, 0.01); // cap nulls at -20 dB
  return gainDbi + 10 * Math.log10(sin2);
}
