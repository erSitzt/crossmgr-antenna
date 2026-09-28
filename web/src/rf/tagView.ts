import type { Setup, TagProfile, Vec3 } from '../model/types';
import { DEG } from './math';
import { bikeShadowDb, buildLinkCtx, evalLink, tagAxisWorld, tagPose, type TagPose } from './link';
import { trajState, type Trajectory } from './lines';
import { TrackPath } from './track';

/** Bike geometry (metres) in the bike frame: X forward, Y up, Z to the rider's right, origin under the front axle. */
export const BIKE = {
  frontWheelR: 0.37,
  rearWheelR: 0.35,
  wheelbase: 1.48,
  rakeDeg: 27,
  forkLen: 0.85,
  forkHalfGap: 0.1,
  plateTiltDeg: 25,
};

/** Where the tag sits on the bike, in the bike frame. */
export function tagLocalPosition(tag: TagProfile): Vec3 {
  const h = tag.heightM;
  const sideZ = tag.side === 'right' ? 1 : -1; // default: left side
  const rake = BIKE.rakeDeg * DEG;
  switch (tag.mount) {
    case 'fork': {
      const t = Math.min(Math.max((h - BIKE.frontWheelR) / Math.cos(rake), 0), BIKE.forkLen);
      return [-t * Math.sin(rake), h, sideZ * (BIKE.forkHalfGap + 0.04)];
    }
    case 'front-plate': {
      // plate centre ≈ 0.95 m, leaning back with the fork; front face
      const x = -0.21 - (h - 0.95) * Math.tan(BIKE.plateTiltDeg * DEG) + 0.015;
      return [x, h, 0];
    }
    case 'side-plate':
      return [-1.25, h, sideZ * 0.145];
    case 'helmet':
      return [-0.62, h, 0];
    default:
      return [0, h, 0];
  }
}

/** Dipole axis in the bike frame (for drawing the tag on the bike). */
export const tagLocalAxis = (tag: TagProfile): Vec3 =>
  tag.axis === 'isotropic' ? [0, 0, 0] : tagAxisWorld(tag.axis, [1, 0, 0], [0, 0, 1], tag.tiltBackDeg ?? 0);

export interface BikePlacement {
  tagPos: Vec3; // simulated tag position (world)
  origin: Vec3; // bike origin (world, on the track surface)
  yaw: number; // rotation about Y (radians) of the bike frame
  pose: TagPose;
}

/** Places the bike so its tag sits exactly where the simulation puts the tag on the given line. */
export function placeBike(setup: Setup, tr: Trajectory, s: number): BikePlacement {
  const path = new TrackPath(setup.track);
  const st = trajState(path, tr, s, setup.tag.heightM);
  const yaw = Math.atan2(-st.dir[2], st.dir[0]);
  const local = tagLocalPosition(setup.tag);
  // bike frame -> world: x along dir, z along right
  const off: Vec3 = [
    st.dir[0] * local[0] + st.right[0] * local[2],
    0,
    st.dir[2] * local[0] + st.right[2] * local[2],
  ];
  const ground = path.elevation(s);
  return {
    tagPos: st.pos,
    origin: [st.pos[0] - off[0], ground, st.pos[2] - off[2]],
    yaw,
    pose: tagPose(setup.tag, st.dir, st.right),
  };
}

export interface TagLink {
  antennaId: string;
  port: number;
  name: string;
  antennaPos: Vec3;
  pTagDbm: number;
  rssiDbm: number;
  margin: number;
  shadowDb: number;
}

/** Link budget from the tag at its current place on the bike to every enabled antenna. */
export function tagLinks(setup: Setup, place: BikePlacement): TagLink[] {
  const ctx = buildLinkCtx(setup);
  return ctx.antennas.map((a) => {
    const r = evalLink(ctx, a, place.tagPos, place.pose);
    const d: Vec3 = [a.pos[0] - place.tagPos[0], a.pos[1] - place.tagPos[1], a.pos[2] - place.tagPos[2]];
    const l = Math.hypot(...d) || 1;
    return {
      antennaId: a.antenna.id,
      port: a.antenna.port,
      name: a.antenna.name,
      antennaPos: a.pos,
      pTagDbm: r.pTagDbm,
      rssiDbm: r.rssiDbm,
      margin: r.margin,
      shadowDb: bikeShadowDb(setup.tag, place.pose, [d[0] / l, d[1] / l, d[2] / l]),
    };
  });
}
