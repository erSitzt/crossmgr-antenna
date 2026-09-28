// World coordinates (three.js, Y up), metres:
//   +X = direction of travel at the finish line, finish plane is X = 0
//   +Z = right-hand side of a rider crossing the finish, -Z = left side
//   +Y = up, ground at Y = 0
export type Vec3 = [number, number, number];

export interface AntennaProfile {
  id: string;
  name: string;
  gainDbic: number;
  hpbwAzDeg: number; // half-power beamwidth, horizontal plane of the antenna
  hpbwElDeg: number; // half-power beamwidth, vertical plane of the antenna
  frontToBackDb: number;
  polarization: 'RHCP' | 'LHCP' | 'linear';
  sizeM: [number, number, number]; // width, height, depth (visual only)
  notes?: string;
}

export interface ReaderProfile {
  id: string;
  name: string;
  minTxDbm: number;
  maxTxDbm: number;
  txStepDb: number;
  minRxSensDbm: number; // most sensitive setting
  ports: number;
  readsPerSecond: number; // single-tag read rate, all ports combined
  antennaDwellMs: number; // time spent on each port before switching
}

export type TagAxis = 'lateral' | 'vertical' | 'along' | 'isotropic';

export interface TagProfile {
  id: string;
  name: string;
  sensitivityDbm: number; // chip + antenna turn-on sensitivity
  gainDbi: number;
  heightM: number; // mounting height above ground
  axis: TagAxis; // dipole axis relative to rider motion
  bodyLossDb: number; // bike / body / mud detuning
  polLossDb: number; // circular reader antenna -> linear tag: 3 dB
  backscatterLossDb: number; // modulation / backscatter efficiency
}

export interface Antenna {
  id: string;
  name: string;
  port: number; // reader port 1..4
  profileId: string;
  position: Vec3;
  // Orientation in degrees: yaw about +Y, then pitch (positive tilts boresight down), then roll.
  // yaw 0 / pitch 0 -> boresight points +Z (from left side towards the track).
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  txDbm: number;
  cableLossDb: number;
  enabled: boolean;
  mount?: AntennaMount; // attached to a truss member; position is then derived
}

export interface Truss {
  id: string;
  name: string;
  position: Vec3; // centre of the arch at its base (Y = base elevation)
  yawDeg: number;
  spanM: number; // clear width between uprights (centre to centre)
  heightM: number; // height of crossbar centre above the base
  sectionM: number; // truss cross-section edge (e.g. 0.29)
  followTrack: boolean; // base elevation follows the track surface under the arch
}

export type TrussMember = 'left' | 'right' | 'top';

export interface AntennaMount {
  trussId: string;
  member: TrussMember;
  /** uprights: height above the truss base; crossbar: offset along the bar from its centre (+ = right) */
  alongM: number;
}

export type ObstacleBase = 'track' | 'ground' | 'manual';

export interface Obstacle {
  id: string;
  name: string;
  materialId: string; // preset id or 'custom'
  fixedDb: number; // loss per crossing (thin things: banners, fences)
  perMeterDb: number; // loss per metre travelled inside (bulky things: hay, water)
  position: Vec3; // centre of the base; Y is derived unless base = 'manual'
  yawDeg: number;
  sizeM: Vec3; // one unit: width (local X), height, depth (local Z)
  count: number; // units in a row along local X
  base: ObstacleBase; // stands on the track surface, the terrain (Y = 0) or a manual elevation
  liftM: number; // raised above the base (e.g. banner on a fence)
}

export type SegmentKind = 'straight' | 'left' | 'right';

export interface TrackSegment {
  id: string;
  kind: SegmentKind;
  lengthM: number; // straight segments
  radiusM: number; // turns: centreline radius
  angleDeg: number; // turns: turn angle
  riseM: number; // height change from start to end of the segment (+ = uphill)
  widthM: number; // track width in this segment (at its end when tapered)
  taper: boolean; // true: width changes gradually from the previous segment's width
}

export interface Track {
  widthM: number; // width at the start of the first segment (used when it tapers)
  startElevationM: number; // elevation at the start of the first segment
  segments: TrackSegment[]; // in direction of travel
  finishSegmentId: string; // segment that contains the finish line
  finishOffsetM: number; // distance from the start of that segment to the finish line
}

export interface GroundSettings {
  presetId: string; // 'custom' when edited
  epsR: number; // relative permittivity
  sigmaSm: number; // conductivity, S/m
  roughnessM: number; // rms surface height variation (ruts, stones)
}

export interface EnvSettings {
  groundReflection: boolean;
  ground: GroundSettings; // track surface (incl. finish table)
  terrainGround: GroundSettings; // surroundings beside the track
  terrainBlockDb: number; // loss when a ray passes through the track body (table, ramps)
  readerSensDbm: number;
  freqMHz: number;
  etsiLimitEirpDbm: number; // 2 W ERP = 35.15 dBm EIRP
}

export interface SimSettings {
  lanes: number;
  speedKmh: number;
  trials: number;
  rssiNoiseDb: number;
  rangeM: number; // simulate from -range .. +range along the track
  antennaChoice: 'mostReads' | 'strongest';
  method: 'quadratic' | 'strongest' | 'first';
  seed: number;
}

export interface Setup {
  version: 2;
  name: string;
  track: Track;
  trusses: Truss[];
  antennas: Antenna[];
  obstacles: Obstacle[];
  antennaProfiles: AntennaProfile[];
  readerProfile: ReaderProfile;
  tag: TagProfile;
  env: EnvSettings;
  sim: SimSettings;
}
