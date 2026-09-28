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
  tag2: { pos: Vec3; pose: TagPose } | null; // second tag (same EPC), if enabled
}

/**
 * World position of another tag on the same bike/rider, given tag 1's position and the bike's
 * direction: the offset between the two mount points is applied rigidly in the bike frame.
 */
export function otherTagState(tag1: TagProfile, other: TagProfile, tag1Pos: Vec3, dir: Vec3, right: Vec3): { pos: Vec3; pose: TagPose } {
  const a = tagLocalPosition(tag1), b = tagLocalPosition(other);
  const dx = b[0] - a[0], dz = b[2] - a[2];
  return {
    pos: [tag1Pos[0] + dir[0] * dx + right[0] * dz, tag1Pos[1] - tag1.heightM + other.heightM, tag1Pos[2] + dir[2] * dx + right[2] * dz],
    pose: tagPose(other, dir, right),
  };
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
    tag2: setup.tag2Enabled ? otherTagState(setup.tag, setup.tag2, st.pos, st.dir, st.right) : null,
  };
}

export interface TagLink {
  tagNo: 1 | 2;
  tagPos: Vec3;
  antennaId: string;
  port: number;
  name: string;
  antennaPos: Vec3;
  pTagDbm: number;
  rssiDbm: number;
  margin: number;
  shadowDb: number;
}

/** Link budget from each tag at its current place on the bike to every enabled antenna. */
export function tagLinks(setup: Setup, place: BikePlacement): TagLink[] {
  const ctx = buildLinkCtx(setup);
  const tags: { no: 1 | 2; tag: TagProfile; pos: Vec3; pose: TagPose }[] = [{ no: 1, tag: setup.tag, pos: place.tagPos, pose: place.pose }];
  if (place.tag2) tags.push({ no: 2, tag: setup.tag2, pos: place.tag2.pos, pose: place.tag2.pose });
  return tags.flatMap((t) =>
    ctx.antennas.map((a) => {
      const r = evalLink(ctx, a, t.pos, t.pose, t.tag);
      const d: Vec3 = [a.pos[0] - t.pos[0], a.pos[1] - t.pos[1], a.pos[2] - t.pos[2]];
      const l = Math.hypot(...d) || 1;
      return {
        tagNo: t.no,
        tagPos: t.pos,
        antennaId: a.antenna.id,
        port: a.antenna.port,
        name: a.antenna.name,
        antennaPos: a.pos,
        pTagDbm: r.pTagDbm,
        rssiDbm: r.rssiDbm,
        margin: r.margin,
        shadowDb: bikeShadowDb(t.tag, t.pose, [d[0] / l, d[1] / l, d[2] / l]),
      };
    }),
  );
}
