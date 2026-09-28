import type { Vec3 } from '../model/types';

/**
 * Typical UHF (865–868 MHz) attenuation of trackside objects. Moisture is the main driver
 * (water absorbs strongly), metal mostly reflects/blocks. These are starting values – adjust them
 * per obstacle and verify with live measurements.
 */
export interface ObstacleMaterial {
  id: string;
  name: string;
  fixedDb: number;
  perMeterDb: number;
  color: string;
  defaultSize: Vec3; // width (along), height, depth
  defaultCount: number;
  defaultLift: number;
}

export const OBSTACLE_MATERIALS: ObstacleMaterial[] = [
  { id: 'hay-dry', name: 'Hay / straw bale (dry)', fixedDb: 0.5, perMeterDb: 4, color: '#d9b650', defaultSize: [2.4, 0.9, 1.2], defaultCount: 3, defaultLift: 0 },
  { id: 'hay-wet', name: 'Hay / straw bale (damp)', fixedDb: 1, perMeterDb: 15, color: '#a58a3c', defaultSize: [2.4, 0.9, 1.2], defaultCount: 3, defaultLift: 0 },
  { id: 'banner-mesh', name: 'Mesh banner (PVC)', fixedDb: 1.5, perMeterDb: 0, color: '#3e8ef7', defaultSize: [3, 1, 0.02], defaultCount: 1, defaultLift: 0.1 },
  { id: 'banner-solid', name: 'Solid banner / tarp (PVC)', fixedDb: 3, perMeterDb: 0, color: '#e5484d', defaultSize: [3, 1, 0.02], defaultCount: 1, defaultLift: 0.1 },
  { id: 'water-barrier', name: 'Water-filled plastic barrier', fixedDb: 1, perMeterDb: 60, color: '#f07f2d', defaultSize: [1.8, 0.8, 0.4], defaultCount: 3, defaultLift: 0 },
  { id: 'tyres', name: 'Tyre wall', fixedDb: 1, perMeterDb: 10, color: '#2b2b2b', defaultSize: [3, 0.8, 0.7], defaultCount: 1, defaultLift: 0 },
  { id: 'wood', name: 'Wooden board / pallets', fixedDb: 1, perMeterDb: 6, color: '#9c6b3c', defaultSize: [2.5, 1, 0.1], defaultCount: 1, defaultLift: 0 },
  { id: 'metal-fence', name: 'Metal crowd barrier / fence', fixedDb: 12, perMeterDb: 0, color: '#9aa4b2', defaultSize: [2.5, 1.1, 0.05], defaultCount: 2, defaultLift: 0 },
  { id: 'people', name: 'Spectators / people', fixedDb: 3, perMeterDb: 8, color: '#c77dff', defaultSize: [3, 1.8, 0.6], defaultCount: 1, defaultLift: 0 },
  { id: 'metal-solid', name: 'Vehicle / container / timing box (metal)', fixedDb: 30, perMeterDb: 0, color: '#6b7280', defaultSize: [2.5, 2.2, 2], defaultCount: 1, defaultLift: 0 },
];

export const MAX_OBSTACLE_LOSS_DB = 40; // diffraction around objects limits the real shadow depth

export const materialById = (id: string) => OBSTACLE_MATERIALS.find((m) => m.id === id);
