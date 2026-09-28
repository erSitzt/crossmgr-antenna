import type { Setup } from '../model/types';
import { buildLinkCtx } from '../rf/link';
import { buildTrajectories, crossingS, type Trajectory } from '../rf/lines';
import { simulatePass } from '../rf/passSim';
import { finishWidth, TrackPath } from '../rf/track';
import { useStore } from '../store';
import { ingestReads, useLive, type RawRead } from './liveClient';

export interface SimReaderOptions {
  intervalS: number; // time between riders
  riders: number; // size of the EPC pool
  mode: 'lanes' | 'mixed'; // lanes: straight lanes, marked for calibration; mixed: lanes + rider lines, unmarked
  speedJitter: number; // ± fraction of the simulation speed
  deviationDb: Record<number, number>; // real world vs model: extra one-way loss per reader port
}

export const DEFAULT_SIM_READER: SimReaderOptions = {
  intervalS: 4,
  riders: 20,
  mode: 'lanes',
  speedJitter: 0.15,
  deviationDb: {},
};

const nowUs = () => Date.now() * 1000;

/**
 * A reader emulator driven by the RF model: every rider rides a lane or rider line through the
 * current setup; its reads are streamed in real time into the live pipeline (pass grouping, chart,
 * calibration), and the true finish crossing is kept to show the timing error per pass.
 */
class SimReader {
  private queue: RawRead[] = [];
  private laneOf = new Map<string, number | null>();
  private active = new Map<string, number>(); // epc -> end of its current pass (µs)
  private ticker: number | undefined;
  private spawner: number | undefined;
  private opts: SimReaderOptions = DEFAULT_SIM_READER;
  private seed = 1;

  get running() {
    return this.spawner !== undefined;
  }

  private status(message: string) {
    const st = useLive.getState();
    useLive.setState({
      source: 'sim',
      status: { connected: true, running: this.running, mode: 'sim', host: 'model', message },
      log: [...st.log.slice(-99), `${new Date().toLocaleTimeString()} ${message}`],
    });
  }

  private ensureTicker() {
    if (this.ticker !== undefined) return;
    this.ticker = window.setInterval(() => {
      const now = nowUs();
      let n = 0;
      while (n < this.queue.length && this.queue[n].ts <= now) n++;
      if (n === 0) return;
      const batch = this.queue.splice(0, n);
      ingestReads(batch, (epc) => this.laneOf.get(epc));
    }, 50);
  }

  start(opts: SimReaderOptions) {
    this.opts = opts;
    this.stopSpawner();
    this.ensureTicker();
    this.spawner = window.setInterval(() => this.sendOne(), Math.max(0.5, opts.intervalS) * 1000);
    this.status(`Simulated reader running – a rider every ${opts.intervalS} s (${opts.mode === 'lanes' ? 'straight lanes, marked' : 'lanes + rider lines'})`);
    this.sendOne();
  }

  update(opts: SimReaderOptions) {
    const wasRunning = this.running;
    this.opts = opts;
    if (wasRunning) this.start(opts);
  }

  private stopSpawner() {
    if (this.spawner !== undefined) window.clearInterval(this.spawner);
    this.spawner = undefined;
  }

  stop() {
    this.stopSpawner();
    this.status('Simulated reader stopped (riders already on track finish their pass)');
  }

  disconnect() {
    this.stopSpawner();
    if (this.ticker !== undefined) window.clearInterval(this.ticker);
    this.ticker = undefined;
    this.queue = [];
    useLive.setState({ source: 'backend', status: { connected: false, running: false, message: 'Simulated reader off' } });
  }

  /** Sends one simulated rider through the finish. */
  sendOne() {
    this.ensureTicker();
    const setup = useStore.getState().setup;
    const live = useLive.getState();
    const o = this.opts;
    const trs = buildTrajectories(setup);
    const lanes = trs.filter((t) => t.kind === 'lane');
    const fw = finishWidth(setup.track);
    const rnd = () => ((this.seed = (this.seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let tr: Trajectory | undefined;
    if (o.mode === 'lanes') {
      const pool = lanes.length ? lanes : [{ id: 'c', label: 'Centre', kind: 'lane' as const, points: [{ sM: 0, frac: 0 }] }];
      if (live.currentLane !== null) {
        tr = pool.reduce((a, b) => (Math.abs(b.points[0].frac * fw - live.currentLane!) < Math.abs(a.points[0].frac * fw - live.currentLane!) ? b : a));
      } else tr = pool[Math.floor(rnd() * pool.length)];
    } else {
      tr = trs[Math.floor(rnd() * trs.length)];
    }
    if (!tr) return;

    // "real world": the model plus the injected per-port deviation
    const world: Setup = {
      ...setup,
      antennas: setup.antennas.map((a) => ({ ...a, cableLossDb: a.cableLossDb + (o.deviationDb[a.port] ?? 0) })),
    };
    const path = new TrackPath(world.track);
    const ctx = buildLinkCtx(world);
    const crossS = crossingS(path, tr);
    const speedKmh = world.sim.speedKmh * (1 + o.speedJitter * (2 * rnd() - 1));
    const v = speedKmh / 3.6;
    const reads = simulatePass(ctx, path, world, tr, crossS, Math.floor(rnd() * 1e9), speedKmh);

    // pick a rider (EPC) that is not on the track right now
    const now = nowUs();
    let epc = '';
    for (let i = 0; i < 50 && !epc; i++) {
      const cand = `SIM${String(1 + Math.floor(rnd() * Math.max(1, o.riders))).padStart(4, '0')}`;
      if ((this.active.get(cand) ?? 0) < now) epc = cand;
    }
    epc ||= `SIM${String(Math.floor(rnd() * 9999)).padStart(4, '0')}`;

    const leadS = world.sim.rangeM / v; // rider appears range metres before the finish
    const crossUs = now + leadS * 1e6;
    this.active.set(epc, crossUs + leadS * 1e6 + 2e6);
    const lateral = tr.kind === 'lane' ? tr.points[0].frac * fw : null;
    this.laneOf.set(epc, o.mode === 'lanes' ? lateral : null);
    const raw: RawRead[] = reads.map((r) => ({ epc, port: r.port, rssi: r.rssi, ts: Math.round(crossUs + r.t * 1e6) }));
    this.queue.push(...raw);
    this.queue.sort((a, b) => a.ts - b.ts);
    useLive.setState({
      truths: [...useLive.getState().truths.slice(-499), { epc, crossUs, speedMs: v, label: tr.label, lateralM: lateral }],
    });
  }
}

export const simReader = new SimReader();
