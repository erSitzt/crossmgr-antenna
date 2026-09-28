import { describe, expect, it } from 'vitest';
import type { Obstacle, Setup } from '../model/types';
import { makeDefaultSetup } from '../presets/templates';
import { computeZones, defaultVolume } from './grid';
import { groundPreset } from './ground';
import { buildLinkCtx, evalLink } from './link';
import { obstacleBoxes, obstacleLossDb, surfaceAt, surfaceMap, throughTrackBody } from './sceneGeom';

const bale = (p: Partial<Obstacle> = {}): Obstacle => ({
  id: 'b', name: 'bale', materialId: 'hay-dry', fixedDb: 0.5, perMeterDb: 4,
  position: [0, 0, 2], yawDeg: 0, sizeM: [2.4, 0.9, 1.2], count: 1, base: 'manual', liftM: 0, ...p,
});

function oneAntenna(s: Setup): Setup {
  return {
    ...s,
    antennas: [{ ...s.antennas[0], mount: undefined, position: [0, 0.5, 0], yawDeg: 0, pitchDeg: 0, txDbm: 30 }],
    env: { ...s.env, groundReflection: false },
    tag: { ...s.tag, axis: 'isotropic' },
  };
}

describe('obstacles', () => {
  it('loss = fixed + per metre * path length inside the box', () => {
    const boxes = obstacleBoxes([bale()]);
    // ray along +Z through the 1.2 m deep bale at height 0.45
    expect(obstacleLossDb(boxes, [0, 0.45, 0], [0, 0.45, 5])).toBeCloseTo(0.5 + 4 * 1.2, 6);
    // passing above the bale: no loss
    expect(obstacleLossDb(boxes, [0, 1.5, 0], [0, 1.5, 5])).toBe(0);
    // a row of 3 is three times as long along local X, yawed 90° it spans Z
    const row = obstacleBoxes([bale({ count: 3, yawDeg: 90, position: [0, 0, 0] })]);
    expect(obstacleLossDb(row, [0, 0.45, -10], [0, 0.45, 10])).toBeCloseTo(0.5 + 4 * 7.2, 6);
  });
  it('a bale between antenna and tag lowers the tag power by that loss', () => {
    const s = oneAntenna(makeDefaultSetup());
    const tag: [number, number, number] = [0, 0.5, 5];
    const free = evalLink(buildLinkCtx(s), buildLinkCtx(s).antennas[0], tag, [0, 1, 0]).pTagDbm;
    const s2 = { ...s, obstacles: [bale()] };
    const ctx2 = buildLinkCtx(s2);
    const blocked = evalLink(ctx2, ctx2.antennas[0], tag, [0, 1, 0]).pTagDbm;
    expect(free - blocked).toBeCloseTo(0.5 + 4 * 1.2, 3);
  });
});

describe('terrain and finish table', () => {
  const s = makeDefaultSetup('tableAfterRight');
  const map = surfaceMap(s.track);
  it('height map knows the table and the ground beside it', () => {
    const on = surfaceAt(map, 0, 0);
    expect(on.onTrack).toBe(true);
    expect(on.y).toBeCloseTo(1.2, 1);
    const beside = surfaceAt(map, 0, 8);
    expect(beside.onTrack).toBe(false);
    expect(beside.y).toBe(0);
  });
  it('a ray from below the table edge to the table top is blocked, one above is not', () => {
    expect(throughTrackBody(map, [0, 0.5, -7], [0, 1.7, 2])).toBe(true);
    expect(throughTrackBody(map, [0, 3, -7], [0, 1.7, 2])).toBe(false);
  });
  it('reflection material depends on where the ray lands', () => {
    const base = oneAntenna(s);
    const a0 = { ...base.antennas[0], position: [0, 2.5, -2] as [number, number, number] };
    const on = { ...base, antennas: [a0], env: { ...base.env, groundReflection: true } };
    const tagOn: [number, number, number] = [0, 1.7, 2]; // reflection point on the table
    const g = (setup: Setup) => { const c = buildLinkCtx(setup); return evalLink(c, c.antennas[0], tagOn, [0, 1, 0]).pTagDbm; };
    const trackWet = g({ ...on, env: { ...on.env, ground: groundPreset('clay-wet') } });
    const trackDry = g({ ...on, env: { ...on.env, ground: groundPreset('sand-dry') } });
    const terrainChanged = g({ ...on, env: { ...on.env, ground: groundPreset('clay-wet'), terrainGround: groundPreset('asphalt') } });
    expect(trackWet).not.toBeCloseTo(trackDry, 2);
    expect(terrainChanged).toBeCloseTo(trackWet, 9); // terrain material irrelevant for a table-top reflection
  });
  it('3D zones stay fast enough with obstacles', () => {
    const t0 = performance.now();
    const zones = computeZones({ ...s, obstacles: [bale({ position: [-3, 1.2, -5.5] })] }, defaultVolume(s, 0.25));
    expect(zones.length).toBe(3);
    console.log(`zones @25cm: ${(performance.now() - t0).toFixed(0)} ms`);
  });
});
