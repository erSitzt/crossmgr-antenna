import type { Antenna, Setup, TrackShape, Truss } from '../model/types';
import { ANTENNA_PROFILES, READER_PROFILES, TAG_PRESETS } from './profiles';

let counter = 0;
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

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
  };
}

/** Default: 2 antennas on the left upright (low/high) pointing right, 1 overhead pointing down. */
export function makeDefaultSetup(shape: TrackShape = 'straight'): Setup {
  const width = 8;
  const truss = makeTruss(width);
  const leftZ = -truss.spanM / 2 + truss.sectionM;
  return {
    version: 1,
    name: `New setup (${shape})`,
    track: {
      widthM: width,
      shape,
      radiusM: 12,
      turnStartM: shape === 'straight' ? 0 : 3,
      turnAngleDeg: 90,
      lengthBeforeM: 25,
      lengthAfterM: 25,
    },
    trusses: [truss],
    antennas: [
      makeAntenna({ port: 1, name: 'Left low', position: [0, 0.7, leftZ], yawDeg: 0, pitchDeg: 0 }),
      makeAntenna({ port: 2, name: 'Left high', position: [0, 1.8, leftZ], yawDeg: 0, pitchDeg: 15 }),
      makeAntenna({
        port: 3,
        name: 'Top centre',
        position: [0, truss.heightM - truss.sectionM, 0],
        pitchDeg: 90,
      }),
    ],
    antennaProfiles: ANTENNA_PROFILES.map((p) => ({ ...p })),
    readerProfile: { ...READER_PROFILES[0] },
    tag: { ...TAG_PRESETS[1] },
    env: {
      groundReflection: false,
      groundGamma: 0.3,
      readerSensDbm: -70,
      freqMHz: 866.5,
      etsiLimitEirpDbm: 35.15,
    },
    sim: {
      lanes: 7,
      speedKmh: 40,
      trials: 10,
      rssiNoiseDb: 2,
      rangeM: 15,
      antennaChoice: 'mostReads',
      method: 'quadratic',
      seed: 1,
    },
  };
}
