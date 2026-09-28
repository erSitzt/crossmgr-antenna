import { describe, expect, it } from 'vitest';
import { TAG_PRESETS } from '../presets/profiles';
import { makeDefaultSetup } from '../presets/templates';
import { CENTRE_LINE } from './lines';
import { runPassSim } from './passSim';
import { otherTagState, placeBike, tagLinks } from './tagView';

const helmet = TAG_PRESETS.find((t) => t.id === 'dogbone-helmet')!;

describe('second tag with the same EPC', () => {
  const base = makeDefaultSetup('straight');
  it('helmet tag sits above and behind the fork tag, rigidly on the bike', () => {
    const st = otherTagState(base.tag, helmet, [0, base.tag.heightM, 0], [1, 0, 0], [0, 0, 1]);
    expect(st.pos[1]).toBeCloseTo(helmet.heightM, 9);
    expect(st.pos[0]).toBeLessThan(0); // behind the fork (−X when riding +X)
    const place = placeBike({ ...base, tag2Enabled: true, tag2: helmet }, CENTRE_LINE, 0);
    expect(place.tag2).not.toBeNull();
    const links = tagLinks({ ...base, tag2Enabled: true, tag2: helmet }, place);
    expect(links.filter((l) => l.tagNo === 2)).toHaveLength(base.antennas.length);
  });
  it('reads of both tags are merged; a helmet tag rescues a fork tag stuck directly on metal', () => {
    const onMetal = { ...base, tag: { ...base.tag, metalGapMm: 0 }, sim: { ...base.sim, trials: 4, lines: [], lanes: 5 } };
    const single = runPassSim(onMetal, { keepSamples: true });
    expect(single.missRate).toBe(1);
    const dual = runPassSim({ ...onMetal, tag2Enabled: true, tag2: helmet }, { keepSamples: true });
    expect(dual.missRate).toBeLessThan(0.1);
    const reads = dual.lanes.flatMap((l) => l.sampleReads);
    expect(reads.some((r) => r.tagNo === 2)).toBe(true);
  });
});
