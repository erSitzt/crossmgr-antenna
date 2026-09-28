import { GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { eirpLinearDbm } from '../rf/link';
import { DEG } from '../rf/math';
import { useStore } from '../store';
import { AntennaMesh } from './AntennaMesh';
import { ReadZones, SliceView } from './FieldViews';
import { PassPaths } from './PassPaths';
import { FinishPlane, TrackMesh } from './TrackMesh';
import { TrussMesh } from './TrussMesh';

const r1 = (x: number) => Math.round(x * 1000) / 1000;
const d1 = (x: number) => Math.round(x * 10) / 10;

export type CameraPreset = 'perspective' | 'top' | 'side' | 'rider';

function CameraRig({ preset, nonce }: { preset: CameraPreset; nonce: number }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const target = new THREE.Vector3(0, 1, 0);
    const positions: Record<CameraPreset, [number, number, number]> = {
      perspective: [-12, 9, 14],
      top: [0, 26, 0.01],
      side: [0, 2, 16],
      rider: [-12, 1.6, 0],
    };
    camera.position.set(...positions[preset]);
    const oc = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (oc) {
      oc.target.copy(target);
      oc.update();
    } else camera.lookAt(target);
  }, [preset, nonce, camera, controls]);
  return null;
}

function SceneContent() {
  const setup = useStore((s) => s.setup);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const mode = useStore((s) => s.transformMode);
  const view = useStore((s) => s.view);
  const zones = useStore((s) => s.zones);
  const sliceH = useStore((s) => s.sliceH);
  const sliceF = useStore((s) => s.sliceF);
  const sim = useStore((s) => s.sim);
  const selectedLane = useStore((s) => s.selectedLane);
  const updateAntenna = useStore((s) => s.updateAntenna);
  const updateTruss = useStore((s) => s.updateTruss);

  const refs = useRef(new Map<string, THREE.Object3D>());
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const setRef = useCallback(
    (id: string) => (o: THREE.Object3D | null) => {
      if (o) refs.current.set(id, o);
      else refs.current.delete(id);
    },
    [],
  );
  useEffect(() => {
    setTarget(selectedId ? refs.current.get(selectedId) ?? null : null);
  }, [selectedId, setup]);

  const isTruss = !!selectedId && setup.trusses.some((t) => t.id === selectedId);

  const onChange = () => {
    if (!target || !selectedId) return;
    const p = target.position;
    if (isTruss) {
      updateTruss(selectedId, { position: [r1(p.x), 0, r1(p.z)], yawDeg: d1(target.rotation.y / DEG) });
    } else {
      const e = new THREE.Euler().setFromQuaternion(target.quaternion, 'YXZ');
      updateAntenna(selectedId, {
        position: [r1(p.x), r1(Math.max(p.y, 0)), r1(p.z)],
        yawDeg: d1(e.y / DEG),
        pitchDeg: d1(e.x / DEG),
        rollDeg: d1(e.z / DEG),
      });
    }
  };

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 5]} intensity={1.2} castShadow />
      <Grid args={[80, 80]} cellSize={1} sectionSize={5} infiniteGrid fadeDistance={70} cellColor="#3a3f47" sectionColor="#58606b" />
      <TrackMesh track={setup.track} />
      <FinishPlane width={setup.track.widthM + 2} />
      {setup.trusses.map((t) => (
        <TrussMesh key={t.id} ref={setRef(t.id)} truss={t} selected={t.id === selectedId} onSelect={(e) => { e.stopPropagation(); select(t.id); }} />
      ))}
      {setup.antennas.map((a) => {
        const prof = setup.antennaProfiles.find((p) => p.id === a.profileId) ?? setup.antennaProfiles[0];
        return (
          <AntennaMesh
            key={a.id}
            ref={setRef(a.id)}
            antenna={a}
            profile={prof}
            selected={a.id === selectedId}
            overLimit={eirpLinearDbm(a, prof) > setup.env.etsiLimitEirpDbm + 1e-9}
            onSelect={(e) => { e.stopPropagation(); select(a.id); }}
          />
        );
      })}
      {view.showZones && <ReadZones zones={zones} setup={setup} opacity={view.zoneOpacity} />}
      {view.showHorizontal && sliceH && <SliceView data={sliceH} mode={view.sliceMode} setup={setup} opacity={view.sliceOpacity} />}
      {view.showFinishSlice && sliceF && <SliceView data={sliceF} mode={view.sliceMode} setup={setup} opacity={view.sliceOpacity} />}
      {view.showPasses && sim && <PassPaths sim={sim} setup={setup} selectedLane={selectedLane} />}
      {target && (
        <TransformControls
          object={target}
          mode={mode}
          size={0.8}
          showY={isTruss ? mode === 'rotate' : true}
          showX={isTruss ? mode === 'translate' : true}
          showZ={isTruss ? mode === 'translate' : true}
          space={mode === 'rotate' ? 'local' : 'world'}
          rotationSnap={mode === 'rotate' ? 5 * DEG : null}
          translationSnap={0.05}
          onObjectChange={onChange}
        />
      )}
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </>
  );
}

export function Viewport({ preset, nonce }: { preset: CameraPreset; nonce: number }) {
  const select = useStore((s) => s.select);
  return (
    <Canvas shadows camera={{ position: [-12, 9, 14], fov: 50, near: 0.05, far: 500 }} onPointerMissed={() => select(null)}>
      <color attach="background" args={['#1b1f24']} />
      <OrbitControls makeDefault target={[0, 1, 0]} />
      <CameraRig preset={preset} nonce={nonce} />
      <SceneContent />
    </Canvas>
  );
}
