import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';

export const BIKE_MODEL_URL = `${import.meta.env.BASE_URL}models/stark-varg-mx1.glb`;
const REAL_LENGTH_M = 2.18; // overall length of a full-size MX bike

/**
 * Fits an arbitrary bike model into the bike frame used by the simulation:
 * X forward, Y up, Z to the right, origin on the ground under the front axle.
 * - scale: longest horizontal extent → REAL_LENGTH_M
 * - forward: the handlebars (highest points) are in front of the middle
 * - front axle: centre of the front tyre's ground contact
 */
function fitBike(scene: THREE.Object3D): THREE.Matrix4 {
  scene.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
  });
  const box = new THREE.Box3().setFromPoints(pts);
  const size = box.getSize(new THREE.Vector3());
  const alongZ = size.z >= size.x;
  const ax = (p: THREE.Vector3) => (alongZ ? p.z : p.x);
  const length = alongZ ? size.z : size.x;
  const mid = alongZ ? (box.min.z + box.max.z) / 2 : (box.min.x + box.max.x) / 2;
  // forward direction from the highest points (handlebars / front plate)
  const top = pts.filter((p) => p.y > box.max.y - size.y * 0.08);
  const topMean = top.reduce((a, p) => a + ax(p), 0) / Math.max(1, top.length);
  const fwdSign = topMean >= mid ? 1 : -1;
  // tyre contact: lowest points, the ones on the forward half belong to the front wheel
  const low = pts.filter((p) => p.y < box.min.y + size.y * 0.03 && (ax(p) - mid) * fwdSign > 0);
  const frontAxle = low.length ? low.reduce((a, p) => a + ax(p), 0) / low.length : mid + (fwdSign * length) / 3;
  const across = alongZ ? (box.min.x + box.max.x) / 2 : (box.min.z + box.max.z) / 2;

  const s = REAL_LENGTH_M / length;
  // rotation that maps the model's forward axis onto +X
  const yaw = alongZ ? (fwdSign > 0 ? Math.PI / 2 : -Math.PI / 2) : fwdSign > 0 ? 0 : Math.PI;
  const t = new THREE.Matrix4().makeTranslation(
    alongZ ? -across : -frontAxle,
    -box.min.y,
    alongZ ? -frontAxle : -across,
  );
  return new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(t);
}

function RealBikeModel() {
  const { scene } = useGLTF(BIKE_MODEL_URL);
  const { object, matrix } = useMemo(() => {
    const object = scene.clone(true);
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.raycast = () => undefined; // clicks go through to the scene
      }
    });
    return { object, matrix: fitBike(object) };
  }, [scene]);
  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <primitive object={object} />
    </group>
  );
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('Bike model could not be loaded, using the simple bike instead.', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Real bike model with the simple primitive bike as loading placeholder and fallback. */
export function RealBike({ fallback }: { fallback: ReactNode }) {
  return (
    <ModelBoundary fallback={fallback}>
      <SuspenseWrap fallback={fallback}>
        <RealBikeModel />
      </SuspenseWrap>
    </ModelBoundary>
  );
}

function SuspenseWrap({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
