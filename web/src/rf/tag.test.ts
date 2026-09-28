import { describe, expect, it } from 'vitest';
import { TAG_PRESETS } from '../presets/profiles';
import { makeDefaultSetup } from '../presets/templates';
import { bikeShadowDb, metalDetuneDb, tagAxisWorld, tagPose } from './link';
import { CENTRE_LINE } from './lines';
import { placeBike, tagLinks } from './tagView';

const dogFork = TAG_PRESETS.find((t) => t.id === 'dogbone-fork')!;

describe('tag orientation and bike effects', () => {
  it('fork tilt leans the dipole back towards the rider', () => {
    const a = tagAxisWorld('vertical', [1, 0, 0], [0, 0, 1], 27);
    expect(a[1]).toBeCloseTo(Math.cos((27 * Math.PI) / 180), 9);
    expect(a[0]).toBeLessThan(0); // top leans backwards (−X when riding +X)
  });
  it('left-side tag is shadowed towards the right, not towards the left', () => {
    const pose = tagPose(dogFork, [1, 0, 0], [0, 0, 1]);
    expect(bikeShadowDb(dogFork, pose, [0, 0, 1])).toBeCloseTo(dogFork.shadowDb, 9); // antenna on the right
    expect(bikeShadowDb(dogFork, pose, [0, 0, -1])).toBe(0); // antenna on the left
  });
  it('metal detuning: severe on metal, small with a fork guard gap', () => {
    expect(metalDetuneDb({ ...dogFork, metalGapMm: 0 })).toBe(25);
    expect(metalDetuneDb({ ...dogFork, metalGapMm: 15 })).toBeCloseTo(4.5, 6);
    expect(metalDetuneDb({ ...dogFork, nearMetal: false })).toBe(0);
  });
  it('bike is placed so the tag sits where the simulation puts it; left fork tag reads worse from the right', () => {
    const s = makeDefaultSetup('straight');
    const place = placeBike(s, CENTRE_LINE, 0);
    expect(place.tagPos[1]).toBeCloseTo(s.tag.heightM, 6);
    expect(Math.abs(place.tagPos[2])).toBeLessThan(1e-6);
    // one antenna left, one right, symmetric
    const left = { ...s.antennas[0], mount: undefined, position: [0, 1, -4] as [number, number, number], yawDeg: 0, pitchDeg: 0 };
    const right = { ...left, id: 'r', port: 2, position: [0, 1, 4] as [number, number, number], yawDeg: 180 };
    const links = tagLinks({ ...s, antennas: [left, right], env: { ...s.env, groundReflection: false } }, place);
    // symmetric antennas: the shadow costs the right antenna once on the tag power and twice on the RSSI
    expect(links[0].pTagDbm - links[1].pTagDbm).toBeCloseTo(dogFork.shadowDb, 1);
    expect(links[0].rssiDbm - links[1].rssiDbm).toBeCloseTo(dogFork.shadowDb * 2, 1);
  });
});
