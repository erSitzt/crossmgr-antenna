import { create } from 'zustand';
import { estimatePassTime, type Read } from '../rf/regression';

export interface RawRead {
  epc: string;
  port: number;
  rssi: number;
  ts: number; // microseconds (reader clock)
}

export interface Pass {
  id: number;
  epc: string;
  reads: RawRead[];
  startTs: number;
  endTs: number;
  closed: boolean;
  lateralM: number | null; // lane marked by the operator for calibration
  estimateUs: number | null; // estimated crossing time (absolute, µs)
  lastWallMs: number; // browser time of the last read (to close passes when the tag goes quiet)
}

export interface PassTruth {
  epc: string;
  crossUs: number; // true finish crossing (reader clock)
  speedMs: number;
  label: string; // lane / line the rider used
  lateralM: number | null; // lane marked for calibration (straight lanes only)
}

export interface ReaderStatus {
  connected: boolean;
  running: boolean;
  mode?: string;
  host?: string | null;
  message?: string;
  powerTable?: number[];
}

interface LiveState {
  socket: WebSocket | null;
  wsOpen: boolean;
  status: ReaderStatus;
  log: string[];
  passes: Pass[];
  totalReads: number;
  recording: RawRead[];
  currentLane: number | null;
  source: 'backend' | 'sim';
  truths: PassTruth[]; // simulated reader: true finish crossings, for comparing the estimate
  gapMs: number;
  openSocket: () => void;
  send: (msg: Record<string, unknown>) => void;
  clear: () => void;
  setLane: (l: number | null) => void;
  setPassLane: (id: number, l: number | null) => void;
  deletePass: (id: number) => void;
}

let passId = 1;

const toRegressionReads = (p: Pass): Read[] =>
  p.reads.map((r) => ({ t: (r.ts - p.startTs) / 1e6, port: r.port, antennaId: String(r.port), rssi: r.rssi }));

export function estimateFor(p: Pass, choice: 'mostReads' | 'strongest', method: 'quadratic' | 'strongest' | 'first') {
  const t = estimatePassTime(toRegressionReads(p), choice, method);
  return t === null ? null : p.startTs + t * 1e6;
}

export const useLive = create<LiveState>((set, get) => ({
  socket: null,
  wsOpen: false,
  status: { connected: false, running: false },
  log: [],
  passes: [],
  totalReads: 0,
  recording: [],
  currentLane: null,
  source: 'backend',
  truths: [],
  gapMs: 1000,

  openSocket: () => {
    if (get().socket) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    const addLog = (m: string) => set({ log: [...get().log.slice(-99), `${new Date().toLocaleTimeString()} ${m}`] });
    ws.onopen = () => { set({ wsOpen: true }); addLog('backend connected'); };
    ws.onclose = () => {
      set({ wsOpen: false, socket: null });
      addLog('backend disconnected – is server/app.py running?');
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status') {
        set({ status: msg });
        if (msg.message) addLog(msg.message);
      } else if (msg.type === 'error') {
        addLog(`ERROR: ${msg.message}`);
      } else if (msg.type === 'reads') {
        ingest(msg.reads as RawRead[]);
      }
    };
    set({ socket: ws });
  },
  send: (msg) => {
    const ws = get().socket;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  },
  clear: () => set({ passes: [], recording: [], totalReads: 0, truths: [] }),
  setLane: (l) => set({ currentLane: l }),
  setPassLane: (id, l) => set({ passes: get().passes.map((p) => (p.id === id ? { ...p, lateralM: l } : p)) }),
  deletePass: (id) => set({ passes: get().passes.filter((p) => p.id !== id) }),
}));

/** Group reads into passes per EPC; a pass closes after `gapMs` without reads of that tag. */
export const ingestReads = (reads: RawRead[], laneFor?: (epc: string) => number | null | undefined) => ingest(reads, laneFor);

function ingest(reads: RawRead[], laneFor?: (epc: string) => number | null | undefined) {
  const st = useLive.getState();
  const gapUs = st.gapMs * 1000;
  const passes = st.passes.slice();
  for (const r of reads) {
    let p = passes.find((x) => !x.closed && x.epc === r.epc);
    if (p && r.ts - p.endTs > gapUs) {
      p.closed = true;
      p = undefined;
    }
    if (!p) {
      p = { id: passId++, epc: r.epc, reads: [], startTs: r.ts, endTs: r.ts, closed: false, lateralM: laneFor?.(r.epc) ?? st.currentLane, estimateUs: null, lastWallMs: 0 };
      passes.push(p);
    }
    p.reads.push(r);
    p.lastWallMs = performance.now();
    p.endTs = Math.max(p.endTs, r.ts);
    p.startTs = Math.min(p.startTs, r.ts);
  }
  // close passes that went quiet (reader clock ~ last read ts)
  const latest = reads.length ? Math.max(...reads.map((r) => r.ts)) : 0;
  for (const p of passes) if (!p.closed && latest - p.endTs > gapUs) p.closed = true;
  useLive.setState({
    passes: passes.slice(-200).map((p) => ({ ...p })),
    totalReads: st.totalReads + reads.length,
    recording: st.recording.length < 500_000 ? st.recording.concat(reads) : st.recording,
  });
}

/** Close passes whose tag has not been seen for `gapMs` (browser clock). Call periodically. */
export function closeStalePasses() {
  const st = useLive.getState();
  const now = performance.now();
  if (!st.passes.some((p) => !p.closed && now - p.lastWallMs > st.gapMs)) return;
  useLive.setState({
    passes: st.passes.map((p) => (!p.closed && now - p.lastWallMs > st.gapMs ? { ...p, closed: true } : p)),
  });
}
