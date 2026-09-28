import type { GroundSettings } from '../model/types';

/**
 * Typical ground constants around 866 MHz (relative permittivity εr, conductivity σ in S/m).
 * Moisture dominates: the same clay can range from εr ≈ 5 (dry) to 30 (soaked). Treat these as
 * starting points and calibrate with live measurements.
 */
export const GROUND_PRESETS: (GroundSettings & { name: string })[] = [
  { presetId: 'clay-moist', name: 'Hard-packed clay soil (moist)', epsR: 15, sigmaSm: 0.05, roughnessM: 0.03 },
  { presetId: 'clay-wet', name: 'Wet clay / mud (after rain, watered)', epsR: 25, sigmaSm: 0.2, roughnessM: 0.05 },
  { presetId: 'soil-dry', name: 'Dry soil / loam', epsR: 6, sigmaSm: 0.005, roughnessM: 0.03 },
  { presetId: 'sand-dry', name: 'Dry sand', epsR: 3.5, sigmaSm: 0.001, roughnessM: 0.05 },
  { presetId: 'sand-wet', name: 'Wet sand', epsR: 20, sigmaSm: 0.05, roughnessM: 0.05 },
  { presetId: 'asphalt', name: 'Asphalt', epsR: 5, sigmaSm: 0.005, roughnessM: 0.005 },
  { presetId: 'concrete', name: 'Concrete', epsR: 6.5, sigmaSm: 0.02, roughnessM: 0.005 },
];

type C = [number, number];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const csqrt = (a: C): C => {
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt((r + a[0]) / 2);
  const im = Math.sign(a[1] || 1) * Math.sqrt(Math.max((r - a[0]) / 2, 0));
  return [re, im];
};

/**
 * Complex reflection coefficient of a rough dielectric ground (Fresnel + Ament roughness factor).
 * @param sinPsi  sine of the grazing angle (angle between ray and ground surface)
 * @param wTE     fraction of the tag's field perpendicular to the plane of incidence
 *                (horizontal polarisation); 1 - wTE uses the vertical (TM) coefficient
 */
export function groundReflection(g: GroundSettings, sinPsi: number, wTE: number, lambda: number): C {
  const s = Math.min(Math.max(sinPsi, 1e-4), 1);
  const cos2 = 1 - s * s;
  const epsC: C = [g.epsR, -60 * g.sigmaSm * lambda];
  const root = csqrt([epsC[0] - cos2, epsC[1]]);
  const gh = div([s - root[0], -root[1]], [s + root[0], root[1]]);
  const es = mul(epsC, [s, 0]);
  const gv = div([es[0] - root[0], es[1] - root[1]], [es[0] + root[0], es[1] + root[1]]);
  const rough = Math.exp(-8 * ((Math.PI * g.roughnessM * s) / lambda) ** 2);
  return [(wTE * gh[0] + (1 - wTE) * gv[0]) * rough, (wTE * gh[1] + (1 - wTE) * gv[1]) * rough];
}
