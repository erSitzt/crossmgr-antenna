import type { Setup, Vec3 } from '../model/types';
import { buildLinkCtx, eirpLinearDbm, evalLink, tagAxisWorld, type LinkCtx } from './link';
import { estimatePassTime, type Read } from './regression';
import { makeRng } from './rng';
import { TrackPath } from './track';

export interface LaneResult {
  lateralM: number;
  meanReads: number;
  readsPerPort: Record<number, number>; // mean per trial
  missRate: number; // fraction of trials without a time estimate
  meanErrCm: number; // + = time estimated after the true finish crossing
  stdErrCm: number;
  errorsCm: number[];
  wallPoint: Vec3 | null; // where the timing "sees" the finish for this lane
  sampleReads: Read[]; // reads of the first trial (for charts)
}

export interface SimResult {
  lanes: LaneResult[];
  meanErrCm: number;
  stdErrCm: number;
  maxAbsLaneErrCm: number;
  missRate: number;
  minLaneReads: number;
  score: number;
  txDbm: Record<string, number>;
}

export interface SimOptions {
  txDbm?: Record<string, number>;
  keepSamples?: boolean;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

export function laneOffsets(widthM: number, lanes: number): number[] {
  if (lanes <= 1) return [0];
  const edge = Math.min(0.5, widthM / 4);
  return Array.from({ length: lanes }, (_, i) => -widthM / 2 + edge + (i * (widthM - 2 * edge)) / (lanes - 1));
}

function simulatePass(
  ctx: LinkCtx,
  path: TrackPath,
  setup: Setup,
  lateral: number,
  seed: number,
): Read[] {
  const rng = makeRng(seed);
  const { sim, readerProfile: rp, tag } = setup;
  const v = sim.speedKmh / 3.6;
  const range = sim.rangeM;
  const dt = 1 / rp.readsPerSecond;
  const nAnt = ctx.antennas.length;
  if (nAnt === 0) return [];
  const dwell = rp.antennaDwellMs / 1000;
  const phase = rng.next() * dwell * nAnt;
  const reads: Read[] = [];
  for (let t = -range / v; t <= range / v; t += dt) {
    const slot = Math.floor((t + phase) / dwell);
    const a = ctx.antennas[((slot % nAnt) + nAnt) % nAnt];
    const noise = rng.gauss() * sim.rssiNoiseDb;
    const protocolOk = rng.next() < 0.9;
    const smp = path.sample(v * t);
    const pos: Vec3 = [smp.pos[0] + smp.right[0] * lateral, tag.heightM, smp.pos[2] + smp.right[2] * lateral];
    const res = evalLink(ctx, a, pos, tagAxisWorld(tag.axis, smp.dir, smp.right));
    if (protocolOk && res.margin + noise > 0) {
      reads.push({ t, port: a.antenna.port, antennaId: a.antenna.id, rssi: Math.round(res.rssiDbm + noise) });
    }
  }
  return reads;
}

export function runPassSim(setup: Setup, opts: SimOptions = {}): SimResult {
  const ctx = buildLinkCtx(setup, { txDbm: opts.txDbm });
  const path = new TrackPath(setup.track);
  const { sim } = setup;
  const v = sim.speedKmh / 3.6;
  const lanes: LaneResult[] = laneOffsets(setup.track.widthM, sim.lanes).map((lateral, li) => {
    const errors: number[] = [];
    const perPort: Record<number, number> = {};
    let totalReads = 0;
    let misses = 0;
    let sample: Read[] = [];
    for (let tr = 0; tr < sim.trials; tr++) {
      const reads = simulatePass(ctx, path, setup, lateral, sim.seed * 100003 + li * 1009 + tr);
      if (tr === 0 && opts.keepSamples) sample = reads;
      totalReads += reads.length;
      for (const r of reads) perPort[r.port] = (perPort[r.port] ?? 0) + 1;
      const tEst = estimatePassTime(reads, sim.antennaChoice, sim.method);
      if (tEst === null) misses++;
      else errors.push(tEst * v * 100);
    }
    for (const p of Object.keys(perPort)) perPort[+p] /= sim.trials;
    const meanErr = mean(errors);
    return {
      lateralM: lateral,
      meanReads: totalReads / sim.trials,
      readsPerPort: perPort,
      missRate: misses / sim.trials,
      meanErrCm: meanErr,
      stdErrCm: std(errors),
      errorsCm: errors,
      wallPoint: errors.length ? path.point(meanErr / 100, lateral, setup.tag.heightM) : null,
      sampleReads: sample,
    };
  });
  const allErr = lanes.flatMap((l) => l.errorsCm);
  const missRate = mean(lanes.map((l) => l.missRate));
  const meanErrCm = mean(allErr);
  const stdErrCm = std(allErr);
  const maxAbsLaneErrCm = Math.max(0, ...lanes.filter((l) => l.errorsCm.length).map((l) => Math.abs(l.meanErrCm)));
  const minLaneReads = Math.min(...lanes.map((l) => l.meanReads));
  const score = objective({ missRate, meanErrCm, stdErrCm, maxAbsLaneErrCm, minLaneReads });
  const txDbm: Record<string, number> = {};
  for (const a of ctx.antennas) txDbm[a.antenna.id] = a.antenna.txDbm;
  return { lanes, meanErrCm, stdErrCm, maxAbsLaneErrCm, missRate, minLaneReads, score, txDbm };
}

/** Lower is better: no missed passes, wall on the finish line, consistent across lanes. */
export function objective(r: {
  missRate: number;
  meanErrCm: number;
  stdErrCm: number;
  maxAbsLaneErrCm: number;
  minLaneReads: number;
}): number {
  const MIN_READS = 8;
  return (
    2000 * r.missRate +
    Math.abs(r.meanErrCm) +
    r.stdErrCm +
    0.5 * r.maxAbsLaneErrCm +
    5 * Math.max(0, MIN_READS - r.minLaneReads)
  );
}

/** Noise-free peak RSSI per reader port for a tag travelling along one lane (for calibration). */
export function peakRssiAlongLane(setup: Setup, lateral: number): Record<number, number> {
  const ctx = buildLinkCtx(setup);
  const path = new TrackPath(setup.track);
  const out: Record<number, number> = {};
  for (let s = -setup.sim.rangeM; s <= setup.sim.rangeM; s += 0.1) {
    const smp = path.sample(s);
    const pos: Vec3 = [smp.pos[0] + smp.right[0] * lateral, setup.tag.heightM, smp.pos[2] + smp.right[2] * lateral];
    const axis = tagAxisWorld(setup.tag.axis, smp.dir, smp.right);
    for (const a of ctx.antennas) {
      const r = evalLink(ctx, a, pos, axis);
      if (r.margin >= 0) out[a.antenna.port] = Math.max(out[a.antenna.port] ?? -Infinity, r.rssiDbm);
    }
  }
  return out;
}

export interface OptimizeProgress {
  iteration: number;
  score: number;
  txDbm: Record<string, number>;
}

/** Coordinate descent over per-antenna transmit power within reader and ETSI limits. */
export function optimizePower(setup: Setup, onProgress?: (p: OptimizeProgress) => void): SimResult {
  const rp = setup.readerProfile;
  const enabled = setup.antennas.filter((a) => a.enabled);
  const limits = new Map<string, [number, number]>();
  for (const a of enabled) {
    const prof = setup.antennaProfiles.find((p) => p.id === a.profileId) ?? setup.antennaProfiles[0];
    const etsiMax = a.txDbm + (setup.env.etsiLimitEirpDbm - eirpLinearDbm(a, prof));
    limits.set(a.id, [rp.minTxDbm, Math.min(rp.maxTxDbm, Math.floor(etsiMax / rp.txStepDb) * rp.txStepDb)]);
  }
  const tx: Record<string, number> = {};
  for (const a of enabled) {
    const [lo, hi] = limits.get(a.id)!;
    tx[a.id] = Math.min(Math.max(a.txDbm, lo), hi);
  }
  let best = runPassSim(setup, { txDbm: tx });
  let iteration = 0;
  onProgress?.({ iteration, score: best.score, txDbm: { ...tx } });
  for (const stepDb of [3, 1, 0.5, 0.25]) {
    if (stepDb < rp.txStepDb) break;
    let improved = true;
    let rounds = 0;
    while (improved && rounds++ < 8) {
      improved = false;
      for (const a of enabled) {
        const [lo, hi] = limits.get(a.id)!;
        for (const dir of [-1, 1]) {
          const cand = Math.min(Math.max(tx[a.id] + dir * stepDb, lo), hi);
          if (cand === tx[a.id]) continue;
          const trial = { ...tx, [a.id]: cand };
          const res = runPassSim(setup, { txDbm: trial });
          iteration++;
          if (res.score < best.score - 1e-6) {
            best = res;
            tx[a.id] = cand;
            improved = true;
            onProgress?.({ iteration, score: best.score, txDbm: { ...tx } });
            break;
          }
        }
      }
    }
  }
  return runPassSim(setup, { txDbm: tx, keepSamples: true });
}
