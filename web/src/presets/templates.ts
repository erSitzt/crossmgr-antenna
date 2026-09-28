import { newId } from '../model/ids';
import { normalizeSetup } from '../model/normalize';
import type { Antenna, Setup, Track, TrackSegment, Truss } from '../model/types';
import { groundPreset } from '../rf/ground';
import { makeLine } from '../rf/lines';
import { ANTENNA_PROFILES, READER_PROFILES, TAG_PRESETS } from './profiles';

export { newId };

export function makeAntenna(partial: Partial<Antenna> & Pick<Antenna, 'port' | 'position'>): Antenna {
  return {
    id: newId('ant'),
    name: `Antenna ${partial.port}`,
    profileId: ANTENNA_PROFILES[0].id,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    txDbm: 27,
    cableLossDb: 1,
    enabled: true,
    ...partial,
  };
}

export function makeTruss(widthM: number): Truss {
  return {
    id: newId('truss'),
    name: 'Finish arch',
    position: [0, 0, 0],
    yawDeg: 0,
    spanM: widthM + 1.2,
    heightM: 4.5,
    sectionM: 0.29,
    followTrack: true,
  };
}

export function makeSegment(kind: TrackSegment['kind'], p: Partial<TrackSegment> = {}): TrackSegment {
  return { id: newId('seg'), kind, lengthM: 10, radiusM: 12, angleDeg: 90, riseM: 0, widthM: 8, taper: false, ...p };
}

export type TrackPreset =
  | 'straight'
  | 'afterLeft'
  | 'afterRight'
  | 'beforeLeft'
  | 'beforeRight'
  | 'tableAfterRight'
  | 'tableAfterLeft';

export const TRACK_PRESETS: { id: TrackPreset; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'afterRight', label: 'Finish after a right turn' },
  { id: 'afterLeft', label: 'Finish after a left turn' },
  { id: 'beforeRight', label: 'Finish before a right turn' },
  { id: 'beforeLeft', label: 'Finish before a left turn' },
  { id: 'tableAfterRight', label: 'Finish table after a 90° right turn' },
  { id: 'tableAfterLeft', label: 'Finish table after a 90° left turn' },
];

export function makeTrack(preset: TrackPreset, widthM = 8): Track {
  const S = (lengthM: number, riseM = 0) => makeSegment('straight', { lengthM, riseM, widthM });
  const T = (kind: 'left' | 'right', radiusM = 12, angleDeg = 90) => makeSegment(kind, { radiusM, angleDeg, widthM });
  const build = (segments: TrackSegment[], finishIndex: number, finishOffsetM: number): Track => ({
    widthM,
    startElevationM: 0,
    segments,
    finishSegmentId: segments[finishIndex].id,
    finishOffsetM,
  });
  switch (preset) {
    case 'straight':
      return build([S(50)], 0, 25);
    case 'afterLeft':
    case 'afterRight':
      return build([S(25), T(preset === 'afterLeft' ? 'left' : 'right'), S(30)], 2, 5);
    case 'beforeLeft':
    case 'beforeRight':
      return build([S(30), T(preset === 'beforeLeft' ? 'left' : 'right'), S(25)], 0, 25);
    case 'tableAfterLeft':
    case 'tableAfterRight':
      // approach, 90° turn, ramp up onto the finish table, table top (finish), ramp down, run-out
      return build(
        [S(25), T(preset === 'tableAfterLeft' ? 'left' : 'right', 10), S(5, 1.2), S(14), S(5, -1.2), S(20)],
        3,
        4,
      );
  }
}

/** A corner-cut line matching the turn before the finish (riders cut across to the other side). */
function defaultLines(preset: TrackPreset) {
  if (preset === 'afterRight' || preset === 'tableAfterRight') return [makeLine('cut-right-left', newId('line'))];
  if (preset === 'afterLeft' || preset === 'tableAfterLeft') return [makeLine('cut-left-right', newId('line'))];
  return [];
}

/** Default: finish arch with 2 antennas on the left upright (low/high) pointing right and 1 overhead pointing down. */
export function makeDefaultSetup(preset: TrackPreset = 'straight'): Setup {
  const track = makeTrack(preset);
  const truss = makeTruss(track.widthM);
  const mount = (member: 'left' | 'right' | 'top', alongM: number) => ({ trussId: truss.id, member, alongM });
  return normalizeSetup({
    version: 2,
    name: `New setup (${TRACK_PRESETS.find((p) => p.id === preset)?.label ?? preset})`,
    track,
    trusses: [truss],
    antennas: [
      makeAntenna({ port: 1, name: 'Left low', position: [0, 0, 0], mount: mount('left', 0.7) }),
      makeAntenna({ port: 2, name: 'Left high', position: [0, 0, 0], pitchDeg: 15, mount: mount('left', 1.8) }),
      makeAntenna({ port: 3, name: 'Top centre', position: [0, 0, 0], pitchDeg: 90, mount: mount('top', 0) }),
    ],
    obstacles: [],
    antennaProfiles: ANTENNA_PROFILES.map((p) => ({ ...p })),
    readerProfile: { ...READER_PROFILES[0] },
    tag: { ...(TAG_PRESETS.find((t) => t.id === 'dogbone-fork') ?? TAG_PRESETS[0]) },
    env: {
      groundReflection: true,
      ground: groundPreset('clay-moist'),
      terrainGround: groundPreset('grass'),
      terrainBlockDb: 25,
      readerSensDbm: -70,
      freqMHz: 866.5,
      etsiLimitEirpDbm: 35.15,
    },
    sim: {
      includeLanes: true,
      lines: defaultLines(preset),
      randomLines: 0,
      lanes: 7,
      speedKmh: 40,
      trials: 10,
      rssiNoiseDb: 2,
      rangeM: 15,
      antennaChoice: 'mostReads',
      method: 'quadratic',
      seed: 1,
    },
  });
}
