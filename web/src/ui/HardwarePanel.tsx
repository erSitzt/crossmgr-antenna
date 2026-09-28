import type { Antenna, TagAxis, Truss } from '../model/types';
import { READER_PROFILES, TAG_PRESETS } from '../presets/profiles';
import { eirpLinearDbm } from '../rf/link';
import { portColor, useStore } from '../store';
import { Check, NumField, Section, Select } from './controls';

export function HardwarePanel() {
  const setup = useStore((s) => s.setup);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const addAntenna = useStore((s) => s.addAntenna);
  const addTruss = useStore((s) => s.addTruss);
  const mode = useStore((s) => s.transformMode);
  const setMode = useStore((s) => s.setTransformMode);

  const ant = setup.antennas.find((a) => a.id === selectedId);
  const truss = setup.trusses.find((t) => t.id === selectedId);

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
          </>
        }
      >
        <ul className="objlist">
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
      <div className="grid3">
        <NumField label="X (along)" unit="m" value={a.position[0]} step={0.05} onChange={(x) => u({ position: [x, a.position[1], a.position[2]] })} />
        <NumField label="Y (height)" unit="m" value={a.position[1]} step={0.05} min={0} onChange={(y) => u({ position: [a.position[0], y, a.position[2]] })} />
        <NumField label="Z (across)" unit="m" value={a.position[2]} step={0.05} onChange={(z) => u({ position: [a.position[0], a.position[1], z] })} />
      </div>
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
        <NumField label="X" unit="m" value={t.position[0]} step={0.1} onChange={(x) => u({ position: [x, 0, t.position[2]] })} />
        <NumField label="Z" unit="m" value={t.position[2]} step={0.1} onChange={(z) => u({ position: [t.position[0], 0, z] })} />
        <NumField label="Yaw" unit="°" value={t.yawDeg} step={5} onChange={(yawDeg) => u({ yawDeg })} />
      </div>
      <div className="grid3">
        <NumField label="Span" unit="m" value={t.spanM} min={1} step={0.5} onChange={(spanM) => u({ spanM })} />
        <NumField label="Height" unit="m" value={t.heightM} min={1} step={0.25} onChange={(heightM) => u({ heightM })} />
        <NumField label="Section" unit="m" value={t.sectionM} min={0.1} max={0.6} step={0.01} onChange={(sectionM) => u({ sectionM })} />
      </div>
      <p className="muted">Antennas are placed independently; use the Z/Y fields to line them up with the truss members.</p>
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
        <NumField label="Ground |Γ|" value={env.groundGamma} min={0} max={1} step={0.05} onChange={(groundGamma) => updateEnv({ groundGamma })} />
      )}
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
