import { describe, expect, it } from 'vitest';
import { makeDefaultSetup } from '../presets/templates';
import { buildTrajectories, crossingS, fracAt, LINE_PRESETS, trajPoint, trajState, type Trajectory } from './lines';
import { runPassSim } from './passSim';
import { TrackPath } from './track';

const cut: Trajectory = { id: 'c', label: 'cut', kind: 'line', points: LINE_PRESETS[0].points };

describe('rider lines', () => {
  it('interpolates smoothly and holds outside the points', () => {
    expect(fracAt(cut, -100)).toBe(0.45);
    expect(fracAt(cut, 0)).toBe(-0.38);
    expect(fracAt(cut, 100)).toBe(-0.3);
    const mid = fracAt(cut, -4);
    expect(mid).toBeLessThan(0.35);
    expect(mid).toBeGreaterThan(-0.38);
  });
  it('corner cut on the table: starts right, crosses the finish on the left, moving leftwards', () => {
    const s = makeDefaultSetup('tableAfterRight');
    const path = new TrackPath(s.track);
    const x = crossingS(path, cut);
    expect(Math.abs(x)).toBeLessThan(0.3);
    const atFinish = trajPoint(path, cut, x, 0);
    expect(atFinish[2]).toBeLessThan(-2); // left side (−Z)
    const st = trajState(path, cut, -3, 0.5);
    expect(st.dir[2]).toBeLessThan(-0.1); // drifting towards −Z (left)
  });
  it('default table setup simulates lanes plus the corner-cut line, with its crossing on the left', () => {
    const s = makeDefaultSetup('tableAfterRight');
    const trs = buildTrajectories(s);
    expect(trs.filter((t) => t.kind === 'lane')).toHaveLength(7);
    expect(trs.filter((t) => t.kind === 'line')).toHaveLength(1);
    const res = runPassSim({ ...s, sim: { ...s.sim, trials: 3, randomLines: 2 } });
    expect(res.lanes).toHaveLength(10);
    const line = res.lanes.find((l) => l.kind === 'line')!;
    expect(line.lateralM).toBeLessThan(-2);
    expect(res.lanes.filter((l) => l.kind === 'random')).toHaveLength(2);
  });
});
