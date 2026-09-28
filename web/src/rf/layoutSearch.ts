import { newId } from '../model/ids';
import { normalizeSetup } from '../model/normalize';
import type { Antenna, Setup, Truss, TrussMember } from '../model/types';
import { makeAntenna } from '../presets/templates';
import { eirpLinearDbm } from './link';
import { optimizePower, runPassSim, type SimResult } from './passSim';

/** One possible antenna placement on the arch. */
export interface LayoutCandidate {
  member: TrussMember;
  alongM: number;
  yawDeg: number;
  pitchDeg: number;
  label: string;
}

export interface LayoutOptions {
  maxAntennas: number; // 1..4
  trussId: string;
  profileId: string;
  members: TrussMember[];
  searchTxDbm: number; // power used while comparing placements (clamped to reader/ETSI limits)
  searchTrials: number; // trials per line while searching (final results use the setup's trials)
  optimizePower: boolean;
}

export interface LayoutResult {
  count: number;
  antennas: Antenna[];
  sim: SimResult;
  labels: string[];
}

export interface LayoutProgress {
  phase: string;
  count: number;
  evaluations: number;
  bestScore: number | null;
}

/**
 * Discrete placements: uprights at 0.5 m height steps aimed across the track (level, 15°, 30° down,
 * or turned 30° towards oncoming riders); crossbar at 5 offsets pointing down or tilted towards
 * oncoming riders.
 */
export function generateCandidates(t: Truss, members: TrussMember[]): LayoutCandidate[] {
  const out: LayoutCandidate[] = [];
  const heights: number[] = [];
  for (let h = 0.4; h <= Math.min(3.0, t.heightM - t.sectionM) + 1e-6; h += 0.5) heights.push(Math.round(h * 10) / 10);
  for (const side of ['left', 'right'] as const) {
    if (!members.includes(side)) continue;
    const across = side === 'left' ? 0 : 180; // boresight towards the track
    const oncoming = side === 'left' ? -30 : -150; // turned towards approaching riders
    for (const h of heights)
      for (const [yaw, yawLabel] of [[across, 'across'], [oncoming, 'towards riders']] as const)
        for (const pitch of [0, 15, 30])
          out.push({ member: side, alongM: h, yawDeg: yaw, pitchDeg: pitch, label: `${side} upright ${h.toFixed(1)} m, ${yawLabel}, ${pitch}° down` });
  }
  if (members.includes('top')) {
    for (const f of [-0.35, -0.15, 0, 0.15, 0.35]) {
      const along = Math.round(f * t.spanM * 10) / 10;
      out.push({ member: 'top', alongM: along, yawDeg: 0, pitchDeg: 90, label: `crossbar ${along >= 0 ? '+' : ''}${along.toFixed(1)} m, straight down` });
      out.push({ member: 'top', alongM: along, yawDeg: -90, pitchDeg: 60, label: `crossbar ${along >= 0 ? '+' : ''}${along.toFixed(1)} m, 30° towards riders` });
    }
  }
  return out;
}

const sameSpot = (a: LayoutCandidate, b: LayoutCandidate) => a.member === b.member && Math.abs(a.alongM - b.alongM) < 0.3;

function clampTx(setup: Setup, profileId: string, tx: number): number {
  const prof = setup.antennaProfiles.find((p) => p.id === profileId) ?? setup.antennaProfiles[0];
  const rp = setup.readerProfile;
  const probe = makeAntenna({ port: 1, position: [0, 0, 0], profileId: prof.id, txDbm: tx, cableLossDb: 1 });
  const etsiMax = tx + (setup.env.etsiLimitEirpDbm - eirpLinearDbm(probe, prof));
  const hi = Math.min(rp.maxTxDbm, Math.floor(etsiMax / rp.txStepDb) * rp.txStepDb);
  return Math.min(Math.max(tx, rp.minTxDbm), hi);
}

function buildAntennas(opts: LayoutOptions, picks: LayoutCandidate[], tx: number): Antenna[] {
  return picks.map((c, i) =>
    makeAntenna({
      id: newId('ant'),
      port: i + 1,
      name: `Auto ${i + 1} (${c.member === 'top' ? 'top' : c.member})`,
      position: [0, 0, 0],
      profileId: opts.profileId,
      yawDeg: c.yawDeg,
      pitchDeg: c.pitchDeg,
      txDbm: tx,
      mount: { trussId: opts.trussId, member: c.member, alongM: c.alongM },
    }),
  );
}

export function searchLayouts(setup: Setup, opts: LayoutOptions, onProgress?: (p: LayoutProgress) => void): LayoutResult[] {
  const truss = setup.trusses.find((t) => t.id === opts.trussId);
  if (!truss) throw new Error('select a truss for the layout search');
  const cands = generateCandidates(truss, opts.members);
  if (cands.length === 0) throw new Error('no truss members selected');
  const tx = clampTx(setup, opts.profileId, opts.searchTxDbm);
  const searchSetup: Setup = { ...setup, sim: { ...setup.sim, trials: Math.max(1, opts.searchTrials) } };
  let evaluations = 0;
  const cache = new Map<string, number>();
  const score = (picks: LayoutCandidate[]) => {
    const key = picks.map((c) => `${c.member}:${c.alongM}:${c.yawDeg}:${c.pitchDeg}`).sort().join('|');
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const s = normalizeSetup({ ...searchSetup, antennas: buildAntennas(opts, picks, tx) });
    const r = runPassSim(s).score;
    cache.set(key, r);
    evaluations++;
    return r;
  };

  const results: LayoutResult[] = [];
  let picks: LayoutCandidate[] = [];
  const maxN = Math.min(Math.max(1, Math.round(opts.maxAntennas)), setup.readerProfile.ports, 4);
  for (let k = 1; k <= maxN; k++) {
    // greedy: add the best remaining candidate
    let best: LayoutCandidate | null = null;
    let bestScore = Infinity;
    for (const c of cands) {
      if (picks.some((p) => sameSpot(p, c))) continue;
      const sc = score([...picks, c]);
      if (sc < bestScore) { bestScore = sc; best = c; }
      if (evaluations % 10 === 0) onProgress?.({ phase: `adding antenna ${k}`, count: k, evaluations, bestScore: Number.isFinite(bestScore) ? bestScore : null });
    }
    if (!best) break;
    picks = [...picks, best];
    // refine: move each antenna to any other free spot while the others stay
    let improved = true;
    let rounds = 0;
    while (improved && rounds++ < 2) {
      improved = false;
      for (let i = 0; i < picks.length; i++) {
        for (const c of cands) {
          if (picks.some((p, j) => j !== i && sameSpot(p, c))) continue;
          const trial = picks.map((p, j) => (j === i ? c : p));
          const sc = score(trial);
          if (sc < bestScore - 1e-6) { bestScore = sc; picks = trial; improved = true; }
        }
        onProgress?.({ phase: `refining ${k} antenna${k > 1 ? 's' : ''}`, count: k, evaluations, bestScore });
      }
    }
    // final evaluation with the full trial count (and optimised power)
    let final = normalizeSetup({ ...setup, antennas: buildAntennas(opts, picks, tx) });
    let sim: SimResult;
    if (opts.optimizePower) {
      onProgress?.({ phase: `power for ${k} antenna${k > 1 ? 's' : ''}`, count: k, evaluations, bestScore });
      sim = optimizePower({ ...final, sim: { ...final.sim, trials: Math.max(1, opts.searchTrials) } });
      final = normalizeSetup({ ...final, antennas: final.antennas.map((a) => ({ ...a, txDbm: sim.txDbm[a.id] ?? a.txDbm })) });
    }
    sim = runPassSim(final, { keepSamples: true });
    results.push({ count: k, antennas: final.antennas, sim, labels: picks.map((p) => p.label) });
  }
  onProgress?.({ phase: 'done', count: maxN, evaluations, bestScore: results.at(-1)?.sim.score ?? null });
  return results;
}
