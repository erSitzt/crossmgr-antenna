import { describe, expect, it } from 'vitest';
import { makeDefaultSetup } from '../presets/templates';
import { computeZones, defaultVolume } from './grid';
import { buildLinkCtx, eirpLinearDbm, evalLink } from './link';
import { boresight, fsplDb, mulMat, rotYXZ } from './math';
import { runPassSim, optimizePower } from './passSim';
import { antennaGainDb } from './pattern';
import { estimatePassTime, quadFit, type Read } from './regression';
import { TrackPath } from './track';
import type { Setup } from '../model/types';

const prof = makeDefaultSetup().antennaProfiles[0];

describe('math', () => {
  it('FSPL at 866.5 MHz, 1 m ≈ 31.2 dB', () => {
    expect(fsplDb(1, 866.5)).toBeCloseTo(31.2, 1);
    expect(fsplDb(10, 866.5) - fsplDb(1, 866.5)).toBeCloseTo(20, 5);
  });
  it('rotation matches boresight formula', () => {
    for (const [y, p] of [[0, 0], [90, 0], [0, 90], [30, 20], [-120, 45]]) {
      const b = mulMat(rotYXZ(y, p, 13), [0, 0, 1]);
      const e = boresight(y, p);
      b.forEach((v, i) => expect(v).toBeCloseTo(e[i], 9));
    }
    const down = boresight(0, 90);
    expect(down[1]).toBeCloseTo(-1, 9);
  });
});

describe('pattern', () => {
  it('peak at boresight, -3 dB at half beamwidth, floor at back', () => {
    expect(antennaGainDb(prof, [0, 0, 1])).toBeCloseTo(prof.gainDbic, 6);
    const h = (prof.hpbwAzDeg / 2) * (Math.PI / 180);
    expect(antennaGainDb(prof, [Math.sin(h), 0, Math.cos(h)])).toBeCloseTo(prof.gainDbic - 3, 6);
    expect(antennaGainDb(prof, [0, 0, -1])).toBeCloseTo(prof.gainDbic - prof.frontToBackDb, 6);
  });
});

function singleAntennaSetup(): Setup {
  const s = makeDefaultSetup();
  s.antennas = [{ ...s.antennas[0], position: [0, 1, 0], yawDeg: 0, pitchDeg: 0, txDbm: 30 }];
  s.tag = { ...s.tag, axis: 'isotropic', bodyLossDb: 0 };
  return s;
}

describe('link budget', () => {
  it('forward link matches hand calculation', () => {
    const s = singleAntennaSetup();
    const ctx = buildLinkCtx(s);
    const r = evalLink(ctx, ctx.antennas[0], [0, 1, 5], [0, 0, 1]);
    const expected = 30 - 1 + prof.gainDbic + s.tag.gainDbi - s.tag.polLossDb - fsplDb(5, 866.5);
    expect(r.pTagDbm).toBeCloseTo(expected, 6);
  });
  it('forward range of 8.5 dBic @ 30 dBm, -18 dBm tag is ~10-20 m in free space', () => {
    const s = singleAntennaSetup();
    const ctx = buildLinkCtx(s);
    let d = 1;
    while (evalLink(ctx, ctx.antennas[0], [0, 1, d], [0, 0, 1]).pTagDbm >= s.tag.sensitivityDbm) d += 0.1;
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(20);
  });
  it('linear-equivalent EIRP', () => {
    const s = singleAntennaSetup();
    expect(eirpLinearDbm(s.antennas[0], prof)).toBeCloseTo(30 - 1 + 8.5 - 3, 6);
  });
});

describe('track', () => {
  it('finish at origin heading +X; left turn bends towards -Z', () => {
    const s = makeDefaultSetup('left');
    const p = new TrackPath(s.track);
    const f = p.sample(0);
    f.pos.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-9));
    expect(f.dir[0]).toBeCloseTo(1, 9);
    expect(p.sample(20).pos[2]).toBeLessThan(-1);
    const r = new TrackPath(makeDefaultSetup('right').track);
    expect(r.sample(20).pos[2]).toBeGreaterThan(1);
  });
});

describe('regression', () => {
  it('recovers the vertex of a parabola', () => {
    const ts = Array.from({ length: 30 }, (_, i) => -0.3 + i * 0.02);
    const ys = ts.map((t) => -50 - 200 * (t - 0.05) ** 2);
    const fit = quadFit(ts, ys)!;
    expect(-fit.b / (2 * fit.a)).toBeCloseTo(0.05, 6);
    const reads: Read[] = ts.map((t, i) => ({ t, port: 1, antennaId: 'a', rssi: ys[i] }));
    expect(estimatePassTime(reads, 'mostReads', 'quadratic')).toBeCloseTo(0.05, 6);
    expect(estimatePassTime(reads, 'mostReads', 'first')).toBeCloseTo(-0.3, 9);
  });
});

describe('fields and simulation', () => {
  it('produces a closed read zone per enabled antenna', () => {
    const s = makeDefaultSetup();
    const zones = computeZones(s, defaultVolume(s, 0.5));
    expect(zones).toHaveLength(3);
    for (const z of zones) expect(z.indices.length).toBeGreaterThan(30);
  });
  it('symmetric side antennas at the finish give a small timing error', () => {
    const s = makeDefaultSetup();
    s.antennas = s.antennas.slice(0, 1).map((a) => ({ ...a, pitchDeg: 0, yawDeg: 0, txDbm: 31 }));
    s.tag = { ...s.tag, axis: 'vertical' };
    s.sim = { ...s.sim, lanes: 3, trials: 5 };
    const r = runPassSim(s);
    expect(r.missRate).toBe(0);
    expect(Math.abs(r.meanErrCm)).toBeLessThan(40);
  });
  it('optimizer does not make things worse', () => {
    const s = makeDefaultSetup();
    s.sim = { ...s.sim, lanes: 3, trials: 3 };
    const before = runPassSim(s).score;
    const after = optimizePower(s).score;
    expect(after).toBeLessThanOrEqual(before + 1e-9);
  });
});
