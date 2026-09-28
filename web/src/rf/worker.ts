/// <reference lib="webworker" />
import type { Setup } from '../model/types';
import { computeSlice, computeZones, defaultVolume, type SliceSpec } from './grid';
import { optimizePower, runPassSim } from './passSim';

export type WorkerRequest =
  | { id: number; type: 'zones'; setup: Setup; step: number }
  | { id: number; type: 'slice'; setup: Setup; spec: SliceSpec }
  | { id: number; type: 'sim'; setup: Setup }
  | { id: number; type: 'optimize'; setup: Setup };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.type) {
      case 'zones': {
        const zones = computeZones(req.setup, defaultVolume(req.setup, req.step));
        ctx.postMessage(
          { id: req.id, ok: true, result: zones },
          zones.flatMap((z) => [z.positions.buffer, z.indices.buffer]),
        );
        break;
      }
      case 'slice': {
        const s = computeSlice(req.setup, req.spec);
        ctx.postMessage({ id: req.id, ok: true, result: s }, [...s.margin, ...s.rssi].map((a) => a.buffer));
        break;
      }
      case 'sim':
        ctx.postMessage({ id: req.id, ok: true, result: runPassSim(req.setup, { keepSamples: true }) });
        break;
      case 'optimize': {
        const res = optimizePower(req.setup, (p) => ctx.postMessage({ id: req.id, progress: p }));
        ctx.postMessage({ id: req.id, ok: true, result: res });
        break;
      }
    }
  } catch (e) {
    ctx.postMessage({ id: req.id, ok: false, error: String(e) });
  }
};
