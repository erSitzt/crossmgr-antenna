import type { Antenna, GroundSettings, Obstacle, ObstacleBase, TagAxis, Truss, TrussMember } from '../model/types';
import { materialById, OBSTACLE_MATERIALS } from '../presets/obstacles';
import { READER_PROFILES, TAG_PRESETS } from '../presets/profiles';
import { GROUND_PRESETS, groundPreset, groundReflection } from '../rf/ground';
import { eirpLinearDbm } from '../rf/link';
import { wavelength } from '../rf/math';
import { portColor, useStore } from '../store';
import { Check, NumField, Section, Select } from './controls';

export function HardwarePanel() {
  const setup = useStore((s) => s.setup);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const addAntenna = useStore((s) => s.addAntenna);
  const addTruss = useStore((s) => s.addTruss);
  const addObstacle = useStore((s) => s.addObstacle);
  const mode = useStore((s) => s.transformMode);
  const setMode = useStore((s) => s.setTransformMode);

  const ant = setup.antennas.find((a) => a.id === selectedId);
  const truss = setup.trusses.find((t) => t.id === selectedId);
  const obstacle = setup.obstacles.find((o) => o.id === selectedId);

  return (
    <>
      <Section
        title="Scene objects"
        actions={
          <>
            <button onClick={() => addAntenna('left')} title="Antenna on the left side pointing right">+ Left</button>
            <button onClick={() => addAntenna('right')} title="Antenna on the right side pointing left">+ Right</button>
            <button onClick={() => addAntenna('top')} title="Overhead antenna pointing down">+ Top</button>
            <button onClick={addTruss}>+ Truss</button>
            <select
              className="add-select"
              value=""
              onChange={(e) => {
                if (e.target.value) addObstacle(e.target.value);
              }}
            >
              <option value="">+ Obstacle…</option>
              {OBSTACLE_MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </>
        }
      >
        <ul className="objlist">
          {setup.obstacles.map((o) => (
            <li key={o.id} className={o.id === selectedId ? 'sel' : ''} onClick={() => select(o.id)}>
              <span className="dot" style={{ background: materialById(o.materialId)?.color ?? '#b0b0b0', borderRadius: 2 }} /> {o.name}
              <span className="muted"> ×{o.count}</span>
            </li>
          ))}
          {setup.trusses.map((t) => (
            <li key={t.id} className={t.id === selectedId ? 'sel' : ''} onClick={() => select(t.id)}>
              <span className="dot" style={{ background: '#c9ced6' }} /> {t.name}
            </li>
          ))}
          {setup.antennas.map((a) => (
            <li key={a.id} className={a.id === selectedId ? 'sel' : ''} onClick={() => select(a.id)}>
              <span className="dot" style={{ background: portColor(a.port) }} /> P{a.port} · {a.name}
              <span className="muted"> {a.enabled ? `${a.txDbm} dBm` : 'off'}</span>
            </li>
          ))}
        </ul>
        <div className="row">
          <span className="muted">Gizmo:</span>
          <button className={mode === 'translate' ? 'on' : ''} onClick={() => setMode('translate')}>Move (W)</button>
          <button className={mode === 'rotate' ? 'on' : ''} onClick={() => setMode('rotate')}>Rotate (E)</button>
        </div>
      </Section>
      {ant && <AntennaProps a={ant} />}
      {truss && <TrussProps t={truss} />}
      {obstacle && <ObstacleProps o={obstacle} />}
      <TagAndRf />
      <Profiles />
    </>
  );
}

function AntennaProps({ a }: { a: Antenna }) {
  const setup = useStore((s) => s.setup);
  const update = useStore((s) => s.updateAntenna);
  const remove = useStore((s) => s.removeAntenna);
  const dup = useStore((s) => s.duplicateAntenna);
  const u = (p: Partial<Antenna>) => update(a.id, p);
  const prof = setup.antennaProfiles.find((p) => p.id === a.profileId) ?? setup.antennaProfiles[0];
  const rp = setup.readerProfile;
  const eirp = eirpLinearDbm(a, prof);
  const over = eirp > setup.env.etsiLimitEirpDbm + 1e-9;
  return (
    <Section
      title={`Antenna P${a.port}`}
      actions={
        <>
          <button onClick={() => dup(a.id)}>Duplicate</button>
          <button className="danger" onClick={() => remove(a.id)}>Delete</button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input value={a.name} onChange={(e) => u({ name: e.target.value })} />
      </label>
      <Check label="Enabled" value={a.enabled} onChange={(enabled) => u({ enabled })} />
      <Select
        label="Reader port"
        value={String(a.port)}
        options={Array.from({ length: rp.ports }, (_, i) => ({ value: String(i + 1), label: `Port ${i + 1}` }))}
        onChange={(v) => u({ port: +v })}
      />
      <Select label="Model" value={a.profileId} options={setup.antennaProfiles.map((p) => ({ value: p.id, label: p.name }))} onChange={(profileId) => u({ profileId })} />
      <Select
        label="Mounted on"
        value={a.mount ? `${a.mount.trussId}|${a.mount.member}` : ''}
        options={[
          { value: '', label: 'Free (own stand / pole)' },
          ...setup.trusses.flatMap((t) =>
            (['left', 'right', 'top'] as TrussMember[]).map((m) => ({
              value: `${t.id}|${m}`,
              label: `${t.name} – ${m === 'top' ? 'crossbar' : `${m} upright`}`,
            })),
          ),
        ]}
        onChange={(v) => {
          if (!v) return u({ mount: undefined });
          const [trussId, member] = v.split('|') as [string, TrussMember];
          const t = setup.trusses.find((x) => x.id === trussId)!;
          const alongM = member === 'top' ? 0 : Math.min(Math.max(a.position[1] - t.position[1], 0.3), t.heightM);
          const aim = member === 'top' ? { pitchDeg: 90 } : member === 'left' ? { yawDeg: 0 } : { yawDeg: 180 };
          u({ mount: { trussId, member, alongM }, ...(a.mount ? {} : aim) });
        }}
      />
      {a.mount ? (
        <>
          <NumField
            label={a.mount.member === 'top' ? 'Offset on bar' : 'Height on upright'}
            unit="m"
            value={a.mount.alongM}
            step={0.05}
            title={a.mount.member === 'top' ? 'Distance from the crossbar centre, + = right side' : 'Height above the truss base'}
            onChange={(alongM) => u({ mount: { ...a.mount!, alongM } })}
          />
          <p className="mounted">
            Position {a.position.map((v) => v.toFixed(2)).join(' / ')} m (follows the truss). Move gizmo slides along the member.
          </p>
        </>
      ) : (
        <div className="grid3">
          <NumField label="X (along)" unit="m" value={a.position[0]} step={0.05} onChange={(x) => u({ position: [x, a.position[1], a.position[2]] })} />
          <NumField label="Y (elevation)" unit="m" value={a.position[1]} step={0.05} onChange={(y) => u({ position: [a.position[0], y, a.position[2]] })} />
          <NumField label="Z (across)" unit="m" value={a.position[2]} step={0.05} onChange={(z) => u({ position: [a.position[0], a.position[1], z] })} />
        </div>
      )}
      <div className="grid3">
        <NumField label="Yaw" unit="°" value={a.yawDeg} step={5} title="0 = pointing to +Z (from left side across the track), 180 = pointing to -Z, -90 = towards approaching riders" onChange={(yawDeg) => u({ yawDeg })} />
        <NumField label="Tilt down" unit="°" value={a.pitchDeg} step={5} min={-90} max={90} title="0 = horizontal, 90 = pointing straight down" onChange={(pitchDeg) => u({ pitchDeg })} />
        <NumField label="Roll" unit="°" value={a.rollDeg} step={5} onChange={(rollDeg) => u({ rollDeg })} />
      </div>
      <div className="row">
        <span className="muted">Aim:</span>
        <button onClick={() => u({ yawDeg: 0, pitchDeg: 0 })}>→ right</button>
        <button onClick={() => u({ yawDeg: 180, pitchDeg: 0 })}>← left</button>
        <button onClick={() => u({ pitchDeg: 90 })}>↓ down</button>
        <button onClick={() => u({ yawDeg: -90, pitchDeg: 0 })}>↶ oncoming</button>
      </div>
      <NumField label="Tx power" unit="dBm" value={a.txDbm} min={rp.minTxDbm} max={rp.maxTxDbm} step={rp.txStepDb} onChange={(txDbm) => u({ txDbm })} />
      <NumField label="Cable loss" unit="dB" value={a.cableLossDb} min={0} max={10} step={0.1} onChange={(cableLossDb) => u({ cableLossDb })} />
      <p className={over ? 'warn' : 'muted'}>
        EIRP (linear-equivalent): {eirp.toFixed(1)} dBm {over ? `– exceeds ETSI limit ${setup.env.etsiLimitEirpDbm} dBm!` : '(ETSI ok)'}
      </p>
    </Section>
  );
}

function TrussProps({ t }: { t: Truss }) {
  const update = useStore((s) => s.updateTruss);
  const remove = useStore((s) => s.removeTruss);
  const u = (p: Partial<Truss>) => update(t.id, p);
  return (
    <Section title="Truss" actions={<button className="danger" onClick={() => remove(t.id)}>Delete</button>}>
      <label className="field">
        <span>Name</span>
        <input value={t.name} onChange={(e) => u({ name: e.target.value })} />
      </label>
      <div className="grid3">
        <NumField label="X" unit="m" value={t.position[0]} step={0.1} onChange={(x) => u({ position: [x, t.position[1], t.position[2]] })} />
        <NumField label="Z" unit="m" value={t.position[2]} step={0.1} onChange={(z) => u({ position: [t.position[0], t.position[1], z] })} />
        <NumField label="Yaw" unit="°" value={t.yawDeg} step={5} onChange={(yawDeg) => u({ yawDeg })} />
      </div>
      <div className="grid3">
        <NumField label="Span" unit="m" value={t.spanM} min={1} step={0.5} onChange={(spanM) => u({ spanM })} />
        <NumField label="Clear height" unit="m" value={t.heightM} min={1} step={0.1} onChange={(heightM) => u({ heightM })} />
        <NumField label="Section" unit="m" value={t.sectionM} min={0.1} max={0.6} step={0.01} onChange={(sectionM) => u({ sectionM })} />
      </div>
      <Check label="Base follows track elevation" value={t.followTrack} onChange={(followTrack) => u({ followTrack })} />
      {!t.followTrack && (
        <NumField label="Base elevation" unit="m" value={t.position[1]} step={0.1} onChange={(y) => u({ position: [t.position[0], y, t.position[2]] })} />
      )}
      <p className="muted">Antennas mounted on this truss follow when you change height, span or position.</p>
    </Section>
  );
}

function TagAndRf() {
  const setup = useStore((s) => s.setup);
  const updateTag = useStore((s) => s.updateTag);
  const updateEnv = useStore((s) => s.updateEnv);
  const updateReader = useStore((s) => s.updateReader);
  const tag = setup.tag;
  const env = setup.env;
  return (
    <Section title="Tag, reader & environment">
      <Select
        label="Tag preset"
        value={TAG_PRESETS.find((p) => p.id === tag.id)?.id ?? ''}
        options={[{ value: '', label: 'Custom' }, ...TAG_PRESETS.map((p) => ({ value: p.id, label: p.name }))]}
        onChange={(id) => {
          const p = TAG_PRESETS.find((x) => x.id === id);
          if (p) updateTag(p);
        }}
      />
      <div className="grid2">
        <NumField label="Tag height" unit="m" value={tag.heightM} min={0} max={3} step={0.05} onChange={(heightM) => updateTag({ heightM, id: 'custom' })} />
        <Select<TagAxis>
          label="Dipole axis"
          value={tag.axis}
          options={[
            { value: 'vertical', label: 'Vertical' },
            { value: 'lateral', label: 'Across track' },
            { value: 'along', label: 'Along track' },
            { value: 'isotropic', label: 'Isotropic' },
          ]}
          onChange={(axis) => updateTag({ axis, id: 'custom' })}
        />
        <NumField label="Tag sensitivity" unit="dBm" value={tag.sensitivityDbm} step={0.5} onChange={(sensitivityDbm) => updateTag({ sensitivityDbm, id: 'custom' })} />
        <NumField label="Tag gain" unit="dBi" value={tag.gainDbi} step={0.5} onChange={(gainDbi) => updateTag({ gainDbi, id: 'custom' })} />
        <NumField label="Body/bike loss" unit="dB" value={tag.bodyLossDb} min={0} step={0.5} onChange={(bodyLossDb) => updateTag({ bodyLossDb, id: 'custom' })} />
        <NumField label="Polarisation loss" unit="dB" value={tag.polLossDb} min={0} step={0.5} onChange={(polLossDb) => updateTag({ polLossDb, id: 'custom' })} />
        <NumField label="Backscatter loss" unit="dB" value={tag.backscatterLossDb} min={0} step={0.5} onChange={(backscatterLossDb) => updateTag({ backscatterLossDb, id: 'custom' })} />
      </div>
      <Select
        label="Reader"
        value={setup.readerProfile.id}
        options={READER_PROFILES.map((r) => ({ value: r.id, label: r.name }))}
        onChange={(id) => updateReader(READER_PROFILES.find((r) => r.id === id)!)}
      />
      <div className="grid2">
        <NumField label="Rx sensitivity" unit="dBm" value={env.readerSensDbm} min={setup.readerProfile.minRxSensDbm} max={-30} step={1} onChange={(readerSensDbm) => updateEnv({ readerSensDbm })} />
        <NumField label="Reads/s (1 tag)" value={setup.readerProfile.readsPerSecond} min={10} step={10} onChange={(readsPerSecond) => updateReader({ readsPerSecond })} />
        <NumField label="Antenna dwell" unit="ms" value={setup.readerProfile.antennaDwellMs} min={1} step={5} onChange={(antennaDwellMs) => updateReader({ antennaDwellMs })} />
        <NumField label="Frequency" unit="MHz" value={env.freqMHz} step={0.1} onChange={(freqMHz) => updateEnv({ freqMHz })} />
      </div>
      <Check label="Ground reflection (two-ray multipath)" value={env.groundReflection} onChange={(groundReflection) => updateEnv({ groundReflection })} />
      {env.groundReflection && (
        <>
          <GroundEditor title="Track surface (incl. finish table)" value={env.ground} onChange={(ground) => updateEnv({ ground })} />
          <GroundHint ground={env.ground} freqMHz={env.freqMHz} />
          <GroundEditor title="Surroundings beside the track" value={env.terrainGround} onChange={(terrainGround) => updateEnv({ terrainGround })} />
        </>
      )}
      <NumField
        label="Blocked by track body"
        unit="dB"
        value={env.terrainBlockDb}
        min={0}
        max={60}
        step={1}
        title="Extra loss when the direct ray passes through the raised track (table edge, ramps)"
        onChange={(terrainBlockDb) => updateEnv({ terrainBlockDb })}
      />
    </Section>
  );
}

function Profiles() {
  const setup = useStore((s) => s.setup);
  const update = useStore((s) => s.updateProfile);
  const add = useStore((s) => s.addProfile);
  return (
    <Section title="Antenna models" actions={<button onClick={add}>+ Model</button>}>
      {setup.antennaProfiles.map((p) => (
        <details key={p.id} className="profile">
          <summary>{p.name}</summary>
          <label className="field">
            <span>Name</span>
            <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
          </label>
          <div className="grid2">
            <NumField label="Gain" unit="dBic" value={p.gainDbic} step={0.5} onChange={(gainDbic) => update(p.id, { gainDbic })} />
            <NumField label="Front/back" unit="dB" value={p.frontToBackDb} step={1} onChange={(frontToBackDb) => update(p.id, { frontToBackDb })} />
            <NumField label="HPBW az" unit="°" value={p.hpbwAzDeg} min={10} max={180} step={5} onChange={(hpbwAzDeg) => update(p.id, { hpbwAzDeg })} />
            <NumField label="HPBW el" unit="°" value={p.hpbwElDeg} min={10} max={180} step={5} onChange={(hpbwElDeg) => update(p.id, { hpbwElDeg })} />
          </div>
          <Select
            label="Polarisation"
            value={p.polarization}
            options={[
              { value: 'RHCP', label: 'Circular RHCP' },
              { value: 'LHCP', label: 'Circular LHCP' },
              { value: 'linear', label: 'Linear' },
            ]}
            onChange={(polarization) => update(p.id, { polarization })}
          />
          {p.notes && <p className="muted">{p.notes}</p>}
        </details>
      ))}
    </Section>
  );
}

/** Shows |Γ| for typical geometries so the effect of the ground type is visible at a glance. */
function GroundHint({ ground, freqMHz }: { ground: GroundSettings; freqMHz: number }) {
  const lambda = wavelength(freqMHz);
  const at = (deg: number, wTE: number) => Math.hypot(...groundReflection(ground, Math.sin((deg * Math.PI) / 180), wTE, lambda));
  return (
    <p className="muted">
      Track |Γ| at 10° / 45° grazing: horizontal pol. {at(10, 1).toFixed(2)} / {at(45, 1).toFixed(2)}, vertical pol.{' '}
      {at(10, 0).toFixed(2)} / {at(45, 0).toFixed(2)}. Each reflection uses the surface where it lands (table top, ramp or
      ground beside).
    </p>
  );
}

function GroundEditor({ title, value: g, onChange }: { title: string; value: GroundSettings; onChange: (g: GroundSettings) => void }) {
  return (
    <div className="arch">
      <Select
        label={title}
        value={GROUND_PRESETS.some((x) => x.presetId === g.presetId) ? g.presetId : 'custom'}
        options={[...GROUND_PRESETS.map((x) => ({ value: x.presetId, label: x.name })), { value: 'custom', label: 'Custom' }]}
        onChange={(id) => {
          if (GROUND_PRESETS.some((x) => x.presetId === id)) onChange(groundPreset(id));
        }}
      />
      <div className="grid3">
        <NumField label="Permittivity εr" value={g.epsR} min={1} max={81} step={0.5} title="Relative permittivity – rises strongly with moisture" onChange={(epsR) => onChange({ ...g, epsR, presetId: 'custom' })} />
        <NumField label="Conductivity" unit="S/m" value={g.sigmaSm} min={0} max={5} step={0.005} onChange={(sigmaSm) => onChange({ ...g, sigmaSm, presetId: 'custom' })} />
        <NumField label="Roughness" unit="m" value={g.roughnessM} min={0} max={0.5} step={0.01} title="RMS height variation (ruts, stones). Rough ground scatters instead of mirroring." onChange={(roughnessM) => onChange({ ...g, roughnessM, presetId: 'custom' })} />
      </div>
    </div>
  );
}

function ObstacleProps({ o }: { o: Obstacle }) {
  const update = useStore((s) => s.updateObstacle);
  const remove = useStore((s) => s.removeObstacle);
  const dup = useStore((s) => s.duplicateObstacle);
  const u = (p: Partial<Obstacle>) => update(o.id, p);
  return (
    <Section
      title="Obstacle"
      actions={
        <>
          <button onClick={() => dup(o.id)}>Duplicate</button>
          <button className="danger" onClick={() => remove(o.id)}>Delete</button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input value={o.name} onChange={(e) => u({ name: e.target.value })} />
      </label>
      <Select
        label="Material"
        value={materialById(o.materialId) ? o.materialId : 'custom'}
        options={[...OBSTACLE_MATERIALS.map((m) => ({ value: m.id, label: m.name })), { value: 'custom', label: 'Custom' }]}
        onChange={(id) => {
          const m = materialById(id);
          if (m) u({ materialId: m.id, fixedDb: m.fixedDb, perMeterDb: m.perMeterDb });
        }}
      />
      <div className="grid2">
        <NumField label="Loss per crossing" unit="dB" value={o.fixedDb} min={0} max={40} step={0.5} onChange={(fixedDb) => u({ fixedDb, materialId: 'custom' })} />
        <NumField label="Loss inside" unit="dB/m" value={o.perMeterDb} min={0} max={200} step={1} onChange={(perMeterDb) => u({ perMeterDb, materialId: 'custom' })} />
      </div>
      <div className="grid3">
        <NumField label="Unit width" unit="m" value={o.sizeM[0]} min={0.05} step={0.1} onChange={(w) => u({ sizeM: [w, o.sizeM[1], o.sizeM[2]] })} />
        <NumField label="Height" unit="m" value={o.sizeM[1]} min={0.05} step={0.1} onChange={(h) => u({ sizeM: [o.sizeM[0], h, o.sizeM[2]] })} />
        <NumField label="Depth" unit="m" value={o.sizeM[2]} min={0.01} step={0.05} onChange={(d) => u({ sizeM: [o.sizeM[0], o.sizeM[1], d] })} />
        <NumField label="Units in row" value={o.count} min={1} max={50} step={1} onChange={(count) => u({ count: Math.round(count) })} />
        <NumField label="Raised by" unit="m" value={o.liftM} min={0} step={0.1} onChange={(liftM) => u({ liftM })} />
        <NumField label="Yaw" unit="°" value={o.yawDeg} step={5} onChange={(yawDeg) => u({ yawDeg })} />
      </div>
      <div className="grid3">
        <NumField label="X" unit="m" value={o.position[0]} step={0.1} onChange={(x) => u({ position: [x, o.position[1], o.position[2]] })} />
        <NumField label="Z" unit="m" value={o.position[2]} step={0.1} onChange={(z) => u({ position: [o.position[0], o.position[1], z] })} />
        <NumField
          label={o.base === 'manual' ? 'Base Y' : 'Base Y (auto)'}
          unit="m"
          value={o.position[1]}
          step={0.1}
          onChange={(y) => u({ base: 'manual', position: [o.position[0], y, o.position[2]] })}
        />
      </div>
      <Select<ObstacleBase>
        label="Stands on"
        value={o.base}
        options={[
          { value: 'ground', label: 'Ground beside the track (Y = 0)' },
          { value: 'track', label: 'Track surface (e.g. on the table)' },
          { value: 'manual', label: 'Manual elevation' },
        ]}
        onChange={(base) => u({ base })}
      />
    </Section>
  );
}
