import type { Setup } from '../model/types';
import type { SliceData, SliceSpec, ZoneMesh } from './grid';
import type { LayoutOptions, LayoutProgress, LayoutResult } from './layoutSearch';
import type { OptimizeProgress, SimResult } from './passSim';

type Pending = { resolve: (v: any) => void; reject: (e: any) => void; onProgress?: (p: any) => void };

class RfWorker {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const { id, ok, result, error, progress } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      if (progress) return p.onProgress?.(progress);
      this.pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
  }

  request<T>(msg: Record<string, unknown>, onProgress?: (p: any) => void): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...msg, id });
    });
  }
}

// Separate workers so a long optimisation does not block the field views.
const fieldWorker = new RfWorker();
const simWorker = new RfWorker();

export const computeZonesAsync = (setup: Setup, step: number) =>
  fieldWorker.request<ZoneMesh[]>({ type: 'zones', setup, step });

export const computeSliceAsync = (setup: Setup, spec: SliceSpec) =>
  fieldWorker.request<SliceData>({ type: 'slice', setup, spec });

export const runSimAsync = (setup: Setup) => simWorker.request<SimResult>({ type: 'sim', setup });

export const layoutSearchAsync = (setup: Setup, opts: LayoutOptions, onProgress: (p: LayoutProgress) => void) =>
  simWorker.request<LayoutResult[]>({ type: 'layout', setup, opts }, onProgress);

export const optimizeAsync = (setup: Setup, onProgress: (p: OptimizeProgress) => void) =>
  simWorker.request<SimResult>({ type: 'optimize', setup }, onProgress);
