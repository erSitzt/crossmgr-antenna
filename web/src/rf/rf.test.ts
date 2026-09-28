import { describe, expect, it } from 'vitest';
import { makeDefaultSetup, makeSegment, makeTrack } from '../presets/templates';
import { computeZones, defaultVolume } from './grid';
import { buildLinkCtx, eirpLinearDbm, evalLink } from './link';
import { boresight, fsplDb, mulMat, rotYXZ } from './math';
import { runPassSim, optimizePower } from './passSim';
import { antennaGainDb } from './pattern';
import { estimatePassTime, quadFit, type Read } from './regression';
import { finishElevation, TrackPath, widthAtU } from './track';
import { GROUND_PRESETS, groundReflection } from './ground';
import { migrateSetup, normalizeSetup } from '../model/normalize';
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
  s.tag = { ...s.tag, axis: 'isotropic', bodyLossDb: 0, sensitivityDbm: -18, shadowDb: 0, side: 'none', nearMetal: false };
  s.env = { ...s.env, groundReflection: false };
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
  it('finish at origin heading +X; turn after the finish bends left / right', () => {
    const p = new TrackPath(makeTrack('beforeLeft'));
    const f = p.sample(0);
    [f.pos[0], f.pos[2]].forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-6));
    expect(f.dir[0]).toBeCloseTo(1, 6);
    expect(p.sample(20).pos[2]).toBeLessThan(-1);
    expect(new TrackPath(makeTrack('beforeRight')).sample(20).pos[2]).toBeGreaterThan(1);
  });
  it('right turn before the finish: riders arrive from +Z heading -Z, then turn right onto +X', () => {
    const p = new TrackPath(makeTrack('afterRight'));
    expect(p.sample(0).dir[0]).toBeCloseTo(1, 6);
    const back = p.sample(-5 - 12 * (Math.PI / 2) - 5);
    expect(back.pos[2]).toBeGreaterThan(8);
    expect(back.dir[2]).toBeCloseTo(-1, 3);
  });
  it('elevation profile of the finish table', () => {
    const t = makeTrack('tableAfterRight');
    expect(finishElevation(t)).toBeCloseTo(1.2, 9);
    const p = new TrackPath(t);
    expect(p.elevation(0)).toBeCloseTo(1.2, 6);
    expect(p.elevation(-4 - 5 - 20)).toBeCloseTo(0, 6); // before the ramp
    expect(p.point(0, 2, 0.5)[1]).toBeCloseTo(1.7, 6);
  });
});

describe('segment widths', () => {
  it('abrupt and tapered width changes; lanes scale with the local width', () => {
    const t = makeTrack('straight');
    // 50 m straight at 8 m, then a 10 m segment tapering to 12 m, then a 10 m segment at 6 m
    t.segments.push(makeSegment('straight', { lengthM: 10, widthM: 12, taper: true }), makeSegment('straight', { lengthM: 10, widthM: 6 }));
    expect(widthAtU(t, 10)).toBe(8);
    expect(widthAtU(t, 55)).toBeCloseTo(10, 9);
    expect(widthAtU(t, 60)).toBeCloseTo(12, 9);
    expect(widthAtU(t, 61)).toBe(6);
    const p = new TrackPath(t);
    // finish is at u = 25, so s = 30 is u = 55
    expect(p.lanePoint(30, 0.5, 0)[2]).toBeCloseTo(5, 3);
    expect(p.lanePoint(0, -0.5, 0)[2]).toBeCloseTo(-4, 3);
  });
});

describe('truss mounts and elevation', () => {
  it('truss base follows the table, mounted antennas follow truss height', () => {
    const s = makeDefaultSetup('tableAfterRight');
    expect(s.trusses[0].position[1]).toBeCloseTo(1.2, 3);
    const top = s.antennas.find((a) => a.mount?.member === 'top')!;
    expect(top.position[1]).toBeLessThan(1.2 + 4.5);
    expect(top.position[1]).toBeGreaterThan(1.2 + 4.2);
    const s2 = normalizeSetup({ ...s, trusses: [{ ...s.trusses[0], heightM: 3.5 }] });
    const top2 = s2.antennas.find((a) => a.id === top.id)!;
    expect(top2.position[1] - top.position[1]).toBeCloseTo(-1, 3);
    const low = s2.antennas.find((a) => a.mount?.member === 'left')!;
    expect(low.position[1]).toBeCloseTo(1.2 + 0.7, 3);
  });
  it('migrates version-1 files', () => {
    const v1 = {
      version: 1, name: 'old', trusses: [{ id: 't', name: 'A', position: [0, 0, 0], yawDeg: 0, spanM: 9, heightM: 4.5, sectionM: 0.29 }],
      antennas: [], antennaProfiles: [], readerProfile: makeDefaultSetup().readerProfile, tag: makeDefaultSetup().tag,
      env: { groundReflection: false, groundGamma: 0.3, readerSensDbm: -70, freqMHz: 866.5, etsiLimitEirpDbm: 35.15 },
      sim: makeDefaultSetup().sim,
      track: { widthM: 8, shape: 'right', radiusM: 12, turnStartM: 3, turnAngleDeg: 90, lengthBeforeM: 25, lengthAfterM: 25 },
    };
    const s = migrateSetup(v1);
    expect(s.version).toBe(2);
    expect(s.track.segments.map((g) => g.kind)).toEqual(['straight', 'right', 'straight']);
    expect(s.env.ground.epsR).toBeGreaterThan(1);
    expect(new TrackPath(s.track).sample(20).pos[2]).toBeGreaterThan(1);
  });
});

describe('ground reflection', () => {
  const lambda = 0.346;
  const mag = (g: [number, number]) => Math.hypot(g[0], g[1]);
  it('approaches -1 at grazing incidence for any ground', () => {
    for (const g of GROUND_PRESETS) {
      const r = groundReflection({ ...g, roughnessM: 0 }, 0.001, 1, lambda);
      expect(r[0]).toBeLessThan(-0.95);
    }
  });
  it('wet clay reflects more than dry sand; vertical pol has a Brewster dip', () => {
    const clay = GROUND_PRESETS.find((g) => g.presetId === 'clay-wet')!;
    const sand = GROUND_PRESETS.find((g) => g.presetId === 'sand-dry')!;
    const s45 = Math.sin(Math.PI / 4);
    expect(mag(groundReflection(clay, s45, 1, lambda))).toBeGreaterThan(mag(groundReflection(sand, s45, 1, lambda)));
    const brewster = Math.sin(Math.atan(1 / Math.sqrt(sand.epsR)));
    expect(mag(groundReflection({ ...sand, roughnessM: 0 }, brewster, 0, lambda))).toBeLessThan(0.05);
  });
  it('roughness reduces the reflection', () => {
    const g = GROUND_PRESETS[0];
    const s = Math.sin(Math.PI / 4);
    expect(mag(groundReflection({ ...g, roughnessM: 0.1 }, s, 1, lambda))).toBeLessThan(mag(groundReflection({ ...g, roughnessM: 0 }, s, 1, lambda)));
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
    s.tag = { ...s.tag, axis: 'vertical', tiltBackDeg: 0, side: 'none', nearMetal: false };
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
