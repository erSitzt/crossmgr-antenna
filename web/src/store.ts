import { create } from 'zustand';
import { migrateSetup, normalizeSetup } from './model/normalize';
import { OBSTACLE_MATERIALS } from './presets/obstacles';
import { finishWidth } from './rf/track';
import type { Antenna, AntennaProfile, EnvSettings, Obstacle, ReaderProfile, Setup, SimSettings, TagProfile, Track, TrackSegment, Truss } from './model/types';
import { makeAntenna, makeDefaultSetup, makeSegment, makeTrack, makeTruss, newId, type TrackPreset } from './presets/templates';
import type { SliceData, ZoneMesh } from './rf/grid';
import type { OptimizeProgress, SimResult } from './rf/passSim';

export type SliceMode = 'margin' | 'rssi' | 'overlap' | 'dominant' | 'limit';
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
  showBike: boolean;
  bikeRider: boolean;
  bikeLinks: boolean;
  realBike: boolean;
  realRider: boolean;
  bikeS: number; // bike position relative to its line's finish crossing (m, − = before)
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
  newFromTemplate: (preset: TrackPreset) => void;
  setTrackPreset: (preset: TrackPreset) => void;
  addSegment: (afterId?: string) => void;
  updateSegment: (id: string, p: Partial<TrackSegment>) => void;
  removeSegment: (id: string) => void;
  moveSegment: (id: string, dir: -1 | 1) => void;
  setName: (name: string) => void;
  updateTrack: (p: Partial<Track>) => void;
  updateTag: (p: Partial<TagProfile>) => void;
  updateTag2: (p: Partial<TagProfile>) => void;
  setTag2Enabled: (on: boolean) => void;
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
  replaceAntennas: (antennas: Antenna[]) => void;
  addObstacle: (materialId: string) => void;
  updateObstacle: (id: string, p: Partial<Obstacle>) => void;
  duplicateObstacle: (id: string) => void;
  removeObstacle: (id: string) => void;
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
    if (raw) return migrateSetup(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return makeDefaultSetup('straight');
}

export const useStore = create<State>((set, get) => {
  const mut = (fn: (s: Setup) => Setup) => set({ setup: normalizeSetup(fn(get().setup)) });
  const mutTrack = (fn: (t: Track) => Track) => mut((s) => ({ ...s, track: fn(s.track) }));
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
      showBike: true,
      bikeRider: true,
      bikeLinks: true,
      realBike: true,
      realRider: true,
      bikeS: -2,
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
    loadSetup: (s) => set({ setup: migrateSetup(s), selectedId: null, sim: null }),
    newFromTemplate: (preset) => {
      const s = makeDefaultSetup(preset);
      set({ setup: s, selectedId: null, sim: null, view: { ...get().view, sliceHeight: s.tag.heightM } });
    },
    setTrackPreset: (preset) => mutTrack((t) => makeTrack(preset, finishWidth(t))),
    addSegment: (afterId) =>
      mutTrack((t) => {
        const i = afterId ? t.segments.findIndex((g) => g.id === afterId) : t.segments.length - 1;
        const segments = t.segments.slice();
        const prev = t.segments[i];
        segments.splice(i + 1, 0, makeSegment('straight', { lengthM: 10, widthM: prev?.widthM ?? t.widthM }));
        return { ...t, segments };
      }),
    updateSegment: (id, p) =>
      mutTrack((t) => ({ ...t, segments: t.segments.map((g) => (g.id === id ? { ...g, ...p } : g)) })),
    removeSegment: (id) =>
      mutTrack((t) => {
        if (t.segments.length <= 1) return t;
        const i = t.segments.findIndex((g) => g.id === id);
        const segments = t.segments.filter((g) => g.id !== id);
        if (t.finishSegmentId !== id) return { ...t, segments };
        const next = segments[Math.min(i, segments.length - 1)];
        return { ...t, segments, finishSegmentId: next.id, finishOffsetM: 0 };
      }),
    moveSegment: (id, dir) =>
      mutTrack((t) => {
        const i = t.segments.findIndex((g) => g.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= t.segments.length) return t;
        const segments = t.segments.slice();
        [segments[i], segments[j]] = [segments[j], segments[i]];
        return { ...t, segments };
      }),
    setName: (name) => mut((s) => ({ ...s, name })),
    updateTrack: (p) => mut((s) => ({ ...s, track: { ...s.track, ...p } })),
    updateTag: (p) => mut((s) => ({ ...s, tag: { ...s.tag, ...p } })),
    updateTag2: (p) => mut((s) => ({ ...s, tag2: { ...s.tag2, ...p } })),
    setTag2Enabled: (on) => mut((s) => ({ ...s, tag2Enabled: on })),
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
      const half = (finishWidth(s.track) + 1) / 2;
      const mount = (member: 'left' | 'right' | 'top', alongM: number) =>
        truss ? { mount: { trussId: truss.id, member, alongM } } : {};
      const a =
        preset === 'top'
          ? makeAntenna({ port, name: `Top ${port}`, position: [0, 4.2, 0], pitchDeg: 90, ...mount('top', 0) })
          : preset === 'right'
            ? makeAntenna({ port, name: `Right ${port}`, position: [0, 1.0, half], yawDeg: 180, ...mount('right', 1.0) })
            : makeAntenna({ port, name: `Left ${port}`, position: [0, 1.0, -half], ...mount('left', 1.0) });
      set({ setup: normalizeSetup({ ...s, antennas: [...s.antennas, a] }), selectedId: a.id });
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
        mount: src.mount ? { ...src.mount, alongM: src.mount.alongM + 0.5 } : undefined,
      };
      set({ setup: normalizeSetup({ ...s, antennas: [...s.antennas, a] }), selectedId: a.id });
    },
    removeAntenna: (id) => {
      mut((s) => ({ ...s, antennas: s.antennas.filter((a) => a.id !== id) }));
      if (get().selectedId === id) set({ selectedId: null });
    },
    replaceAntennas: (antennas) => {
      mut((s) => ({ ...s, antennas }));
      set({ selectedId: null });
    },
    applyTxPowers: (tx) =>
      mut((s) => ({ ...s, antennas: s.antennas.map((a) => (tx[a.id] !== undefined ? { ...a, txDbm: tx[a.id] } : a)) })),
    addObstacle: (materialId) => {
      const s = get().setup;
      const m = OBSTACLE_MATERIALS.find((x) => x.id === materialId) ?? OBSTACLE_MATERIALS[0];
      const n = s.obstacles.length;
      const o: Obstacle = {
        id: newId('obs'),
        name: m.name,
        materialId: m.id,
        fixedDb: m.fixedDb,
        perMeterDb: m.perMeterDb,
        position: [-6 + (n % 4) * 3, 0, -(finishWidth(s.track) / 2 + m.defaultSize[2] / 2 + 0.5)],
        yawDeg: 0,
        sizeM: [...m.defaultSize],
        count: m.defaultCount,
        base: 'ground',
        liftM: m.defaultLift,
      };
      set({ setup: normalizeSetup({ ...s, obstacles: [...s.obstacles, o] }), selectedId: o.id });
    },
    updateObstacle: (id, p) =>
      mut((s) => ({ ...s, obstacles: s.obstacles.map((o) => (o.id === id ? { ...o, ...p } : o)) })),
    duplicateObstacle: (id) => {
      const s = get().setup;
      const src = s.obstacles.find((o) => o.id === id);
      if (!src) return;
      // place the copy next to the original along its row direction
      const len = src.sizeM[0] * src.count + 0.2;
      const c = Math.cos((src.yawDeg * Math.PI) / 180), sn = Math.sin((src.yawDeg * Math.PI) / 180);
      const o: Obstacle = {
        ...src,
        id: newId('obs'),
        position: [src.position[0] + c * len, src.position[1], src.position[2] - sn * len],
      };
      set({ setup: normalizeSetup({ ...s, obstacles: [...s.obstacles, o] }), selectedId: o.id });
    },
    removeObstacle: (id) => {
      mut((s) => ({ ...s, obstacles: s.obstacles.filter((o) => o.id !== id) }));
      if (get().selectedId === id) set({ selectedId: null });
    },
    updateTruss: (id, p) =>
      mut((s) => ({ ...s, trusses: s.trusses.map((t) => (t.id === id ? { ...t, ...p } : t)) })),
    addTruss: () => {
      const t = makeTruss(finishWidth(get().setup.track));
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
