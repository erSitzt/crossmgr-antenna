import { describe, expect, it } from 'vitest';
import { makeDefaultSetup } from '../presets/templates';
import { generateCandidates, searchLayouts } from './layoutSearch';
import { runPassSim } from './passSim';

describe('layout search', () => {
  const s = makeDefaultSetup('tableAfterRight');
  const truss = s.trusses[0];
  it('generates placements on the selected members only', () => {
    const all = generateCandidates(truss, ['left', 'right', 'top']);
    expect(all.length).toBeGreaterThan(50);
    expect(generateCandidates(truss, ['top']).every((c) => c.member === 'top')).toBe(true);
  });
  it('finds 1..3 antenna layouts mounted on the arch, at least as good as the default layout', () => {
    const quick = { ...s, sim: { ...s.sim, lanes: 5 } };
    const t0 = performance.now();
    const res = searchLayouts(quick, {
      maxAntennas: 3, trussId: truss.id, profileId: s.antennaProfiles[0].id,
      members: ['left', 'right', 'top'], searchTxDbm: 27, searchTrials: 2, optimizePower: false,
    });
    console.log(`layout search 1..3: ${((performance.now() - t0) / 1000).toFixed(1)} s`, res.map((r) => [r.count, r.sim.score.toFixed(1), r.labels]));
    expect(res.map((r) => r.count)).toEqual([1, 2, 3]);
    for (const r of res) {
      expect(r.antennas).toHaveLength(r.count);
      expect(r.antennas.every((a) => a.mount?.trussId === truss.id)).toBe(true);
      expect(new Set(r.antennas.map((a) => a.port)).size).toBe(r.count);
    }
    const baseline = runPassSim(quick).score;
    expect(res[2].sim.score).toBeLessThanOrEqual(baseline + 5);
  }, 120_000);
});
