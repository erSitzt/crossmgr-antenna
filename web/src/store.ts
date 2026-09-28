import { create } from 'zustand';
import type { Antenna, AntennaProfile, EnvSettings, ReaderProfile, Setup, SimSettings, TagProfile, Track, TrackShape, Truss } from './model/types';
import { makeAntenna, makeDefaultSetup, makeTruss, newId } from './presets/templates';
import type { SliceData, ZoneMesh } from './rf/grid';
import type { OptimizeProgress, SimResult } from './rf/passSim';

export type SliceMode = 'margin' | 'rssi' | 'overlap' | 'dominant';
export type TransformMode = 'translate' | 'rotate';

export interface ViewSettings {
  showZones: boolean;
  zoneStep: number;
  zoneOpacity: number;
  showHorizontal: boolean;
  showFinishSlice: boolean;
  sliceHeight: number;
  sliceMode: SliceMode;
  sliceOpacity: number;
  showPasses: boolean;
  autoSim: boolean;
}

interface State {
  setup: Setup;
  selectedId: string | null;
  transformMode: TransformMode;
  view: ViewSettings;
  zones: ZoneMesh[];
  sliceH: SliceData | null;
  sliceF: SliceData | null;
  computing: boolean;
  sim: SimResult | null;
  simBusy: boolean;
  optimizeProgress: OptimizeProgress | null;
  selectedLane: number;

  select: (id: string | null) => void;
  setTransformMode: (m: TransformMode) => void;
  setView: (p: Partial<ViewSettings>) => void;
  loadSetup: (s: Setup) => void;
  newFromTemplate: (shape: TrackShape) => void;
  setName: (name: string) => void;
  updateTrack: (p: Partial<Track>) => void;
  updateTag: (p: Partial<TagProfile>) => void;
  updateEnv: (p: Partial<EnvSettings>) => void;
  updateSim: (p: Partial<SimSettings>) => void;
  updateReader: (p: Partial<ReaderProfile>) => void;
  updateProfile: (id: string, p: Partial<AntennaProfile>) => void;
  addProfile: () => void;
  updateAntenna: (id: string, p: Partial<Antenna>) => void;
  addAntenna: (preset?: 'left' | 'right' | 'top') => void;
  duplicateAntenna: (id: string) => void;
  removeAntenna: (id: string) => void;
  applyTxPowers: (tx: Record<string, number>) => void;
  updateTruss: (id: string, p: Partial<Truss>) => void;
  addTruss: () => void;
  removeTruss: (id: string) => void;
  setFields: (f: Partial<Pick<State, 'zones' | 'sliceH' | 'sliceF' | 'computing'>>) => void;
  setSim: (f: Partial<Pick<State, 'sim' | 'simBusy' | 'optimizeProgress' | 'selectedLane'>>) => void;
}

const STORAGE_KEY = 'crossmgr-antenna.setup';

function loadInitial(): Setup {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Setup;
      if (s.version === 1) return s;
    }
  } catch {
    /* ignore */
  }
  return makeDefaultSetup('straight');
}

export const useStore = create<State>((set, get) => {
  const mut = (fn: (s: Setup) => Setup) => set({ setup: fn(get().setup) });
  return {
    setup: loadInitial(),
    selectedId: null,
    transformMode: 'translate',
    view: {
      showZones: true,
      zoneStep: 0.25,
      zoneOpacity: 0.22,
      showHorizontal: true,
      showFinishSlice: false,
      sliceHeight: 0.5,
      sliceMode: 'dominant',
      sliceOpacity: 0.75,
      showPasses: true,
      autoSim: true,
    },
    zones: [],
    sliceH: null,
    sliceF: null,
    computing: false,
    sim: null,
    simBusy: false,
    optimizeProgress: null,
    selectedLane: 0,

    select: (id) => set({ selectedId: id }),
    setTransformMode: (m) => set({ transformMode: m }),
    setView: (p) => set({ view: { ...get().view, ...p } }),
    loadSetup: (s) => set({ setup: s, selectedId: null, sim: null }),
    newFromTemplate: (shape) => {
      const s = makeDefaultSetup(shape);
      set({ setup: s, selectedId: null, sim: null, view: { ...get().view, sliceHeight: s.tag.heightM } });
    },
    setName: (name) => mut((s) => ({ ...s, name })),
    updateTrack: (p) => mut((s) => ({ ...s, track: { ...s.track, ...p } })),
    updateTag: (p) => mut((s) => ({ ...s, tag: { ...s.tag, ...p } })),
    updateEnv: (p) => mut((s) => ({ ...s, env: { ...s.env, ...p } })),
    updateSim: (p) => mut((s) => ({ ...s, sim: { ...s.sim, ...p } })),
    updateReader: (p) => mut((s) => ({ ...s, readerProfile: { ...s.readerProfile, ...p } })),
    updateProfile: (id, p) =>
      mut((s) => ({ ...s, antennaProfiles: s.antennaProfiles.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
    addProfile: () =>
      mut((s) => ({
        ...s,
        antennaProfiles: [...s.antennaProfiles, { ...s.antennaProfiles[0], id: newId('prof'), name: 'Custom antenna' }],
      })),
    updateAntenna: (id, p) =>
      mut((s) => ({ ...s, antennas: s.antennas.map((a) => (a.id === id ? { ...a, ...p } : a)) })),
    addAntenna: (preset = 'left') => {
      const s = get().setup;
      const used = new Set(s.antennas.map((a) => a.port));
      const port = [1, 2, 3, 4].find((p) => !used.has(p)) ?? s.antennas.length + 1;
      const truss = s.trusses[0];
      const half = (truss?.spanM ?? s.track.widthM + 1) / 2 - (truss?.sectionM ?? 0.3);
      const h = truss?.heightM ?? 4.5;
      const a =
        preset === 'top'
          ? makeAntenna({ port, name: `Top ${port}`, position: [0, h - 0.3, 0], pitchDeg: 90 })
          : preset === 'right'
            ? makeAntenna({ port, name: `Right ${port}`, position: [0, 1.0, half], yawDeg: 180 })
            : makeAntenna({ port, name: `Left ${port}`, position: [0, 1.0, -half] });
      set({ setup: { ...s, antennas: [...s.antennas, a] }, selectedId: a.id });
    },
    duplicateAntenna: (id) => {
      const s = get().setup;
      const src = s.antennas.find((a) => a.id === id);
      if (!src) return;
      const used = new Set(s.antennas.map((a) => a.port));
      const port = [1, 2, 3, 4].find((p) => !used.has(p)) ?? src.port;
      const a: Antenna = {
        ...src,
        id: newId('ant'),
        port,
        name: `${src.name} copy`,
        position: [src.position[0], src.position[1] + 0.5, src.position[2]],
      };
      set({ setup: { ...s, antennas: [...s.antennas, a] }, selectedId: a.id });
    },
    removeAntenna: (id) => {
      mut((s) => ({ ...s, antennas: s.antennas.filter((a) => a.id !== id) }));
      if (get().selectedId === id) set({ selectedId: null });
    },
    applyTxPowers: (tx) =>
      mut((s) => ({ ...s, antennas: s.antennas.map((a) => (tx[a.id] !== undefined ? { ...a, txDbm: tx[a.id] } : a)) })),
    updateTruss: (id, p) =>
      mut((s) => ({ ...s, trusses: s.trusses.map((t) => (t.id === id ? { ...t, ...p } : t)) })),
    addTruss: () => {
      const t = makeTruss(get().setup.track.widthM);
      mut((s) => ({ ...s, trusses: [...s.trusses, t] }));
      set({ selectedId: t.id });
    },
    removeTruss: (id) => {
      mut((s) => ({ ...s, trusses: s.trusses.filter((t) => t.id !== id) }));
      if (get().selectedId === id) set({ selectedId: null });
    },
    setFields: (f) => set(f),
    setSim: (f) => set(f),
  };
});

// Autosave the current setup in the browser (convenience only; use Export for real files).
let saveTimer: number | undefined;
useStore.subscribe((st, prev) => {
  if (st.setup === prev.setup) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st.setup));
    } catch {
      /* ignore */
    }
  }, 500);
});

export const PORT_COLORS: Record<number, string> = {
  1: '#e5484d',
  2: '#3e8ef7',
  3: '#30a46c',
  4: '#f5a623',
};
export const portColor = (port: number) => PORT_COLORS[port] ?? '#b18cff';
