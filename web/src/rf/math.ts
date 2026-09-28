import type { Vec3 } from '../model/types';

export const DEG = Math.PI / 180;
export const C_LIGHT = 299_792_458;

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** 3x3 row-major rotation matrix for Euler order YXZ (yaw, pitch, roll), matching three.js Euler 'YXZ'. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export function rotYXZ(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  const y = yawDeg * DEG, x = pitchDeg * DEG, z = rollDeg * DEG;
  const cy = Math.cos(y), sy = Math.sin(y);
  const cx = Math.cos(x), sx = Math.sin(x);
  const cz = Math.cos(z), sz = Math.sin(z);
  // R = Ry * Rx * Rz ; Rx uses +angle about +X which maps +Z towards -Y (tilts boresight down)
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}

export const mulMat = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** Transpose multiply: world -> local. */
export const mulMatT = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];

export const boresight = (yawDeg: number, pitchDeg: number): Vec3 => {
  const y = yawDeg * DEG, p = pitchDeg * DEG;
  return [Math.cos(p) * Math.sin(y), -Math.sin(p), Math.cos(p) * Math.cos(y)];
};

export const wavelength = (freqMHz: number) => C_LIGHT / (freqMHz * 1e6);

/** Free-space path loss in dB. */
export const fsplDb = (d: number, freqMHz: number) =>
  20 * Math.log10((4 * Math.PI * Math.max(d, 0.05)) / wavelength(freqMHz));

export const dbToLin = (db: number) => Math.pow(10, db / 10);
export const linToDb = (lin: number) => 10 * Math.log10(Math.max(lin, 1e-30));
