import type { AntennaProfile, ReaderProfile, TagProfile } from '../model/types';

// Datasheet values are typical; edit them in the Profiles panel to match your hardware.
export const ANTENNA_PROFILES: AntennaProfile[] = [
  {
    id: 'caen-1537',
    name: 'CAEN ETSI circular 8.5 dBic (rfid.it #1537)',
    gainDbic: 8.5,
    hpbwAzDeg: 70,
    hpbwElDeg: 70,
    frontToBackDb: 20,
    polarization: 'RHCP',
    sizeM: [0.26, 0.26, 0.04],
    notes: 'Circular polarized, 865-868 MHz, IP65. Beamwidth assumed ~70°, check the datasheet.',
  },
  {
    id: 'panel-9dbic',
    name: 'Generic 9 dBic circular panel (Laird S9028 / Times-7 class)',
    gainDbic: 9,
    hpbwAzDeg: 65,
    hpbwElDeg: 65,
    frontToBackDb: 22,
    polarization: 'RHCP',
    sizeM: [0.26, 0.26, 0.035],
  },
  {
    id: 'mat-6dbic',
    name: 'Generic 6 dBic wide-beam panel',
    gainDbic: 6,
    hpbwAzDeg: 100,
    hpbwElDeg: 100,
    frontToBackDb: 15,
    polarization: 'RHCP',
    sizeM: [0.2, 0.2, 0.03],
  },
];

export const READER_PROFILES: ReaderProfile[] = [
  {
    id: 'impinj-r420',
    name: 'Impinj Speedway R420',
    minTxDbm: 10,
    maxTxDbm: 31.5,
    txStepDb: 0.25,
    minRxSensDbm: -84,
    ports: 4,
    readsPerSecond: 400,
    antennaDwellMs: 25,
  },
  {
    id: 'impinj-r700',
    name: 'Impinj R700',
    minTxDbm: 10,
    maxTxDbm: 33,
    txStepDb: 0.25,
    minRxSensDbm: -92,
    ports: 4,
    readsPerSecond: 500,
    antennaDwellMs: 25,
  },
];

export const TAG_PRESETS: TagProfile[] = [
  {
    id: 'plate',
    name: 'Number-plate tag (front, horizontal dipole)',
    sensitivityDbm: -18,
    gainDbi: 2,
    heightM: 0.9,
    axis: 'lateral',
    bodyLossDb: 3,
    polLossDb: 3,
    backscatterLossDb: 8,
  },
  {
    id: 'fork',
    name: 'Fork tag (vertical dipole)',
    sensitivityDbm: -18,
    gainDbi: 2,
    heightM: 0.5,
    axis: 'vertical',
    bodyLossDb: 4,
    polLossDb: 3,
    backscatterLossDb: 8,
  },
  {
    id: 'helmet',
    name: 'Helmet tag',
    sensitivityDbm: -17,
    gainDbi: 1,
    heightM: 1.4,
    axis: 'along',
    bodyLossDb: 3,
    polLossDb: 3,
    backscatterLossDb: 8,
  },
];
