import { useRef } from 'react';
import type { Setup, TrackShape } from '../model/types';
import { useStore } from '../store';
import { Check, NumField, Section, Select, Slider } from './controls';

export function SetupPanel() {
  const setup = useStore((s) => s.setup);
  const updateTrack = useStore((s) => s.updateTrack);
  const newFromTemplate = useStore((s) => s.newFromTemplate);
  const loadSetup = useStore((s) => s.loadSetup);
  const setName = useStore((s) => s.setName);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = setup.track;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(setup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${setup.name.replace(/[^\w-]+/g, '_') || 'setup'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const s = JSON.parse(await f.text()) as Setup;
      if (s.version !== 1 || !Array.isArray(s.antennas)) throw new Error('not a setup file');
      loadSetup(s);
    } catch (e) {
      alert(`Could not load setup: ${e}`);
    }
  };

  return (
    <>
      <Section
        title="Setup"
        actions={
          <>
            <button onClick={exportJson}>Export</button>
            <button onClick={() => fileRef.current?.click()}>Import</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </>
        }
      >
        <label className="field">
          <span>Name</span>
          <input value={setup.name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row">
          <span className="muted">New from template:</span>
          {(['straight', 'left', 'right'] as TrackShape[]).map((s) => (
            <button key={s} onClick={() => confirm('Replace the current setup?') && newFromTemplate(s)}>
              {s}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Track at the finish">
        <Select
          label="Shape"
          value={t.shape}
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'left', label: 'Left turn' },
            { value: 'right', label: 'Right turn' },
          ]}
          onChange={(shape) => updateTrack({ shape })}
        />
        <NumField label="Width" unit="m" value={t.widthM} min={2} max={30} step={0.5} onChange={(widthM) => updateTrack({ widthM })} />
        {t.shape !== 'straight' && (
          <>
            <NumField label="Turn radius" unit="m" value={t.radiusM} min={3} max={200} step={1} onChange={(radiusM) => updateTrack({ radiusM })} />
            <NumField
              label="Turn starts at"
              unit="m"
              title="Distance from the finish line along the track where the turn begins; negative = turn is before the finish"
              value={t.turnStartM}
              step={0.5}
              onChange={(turnStartM) => updateTrack({ turnStartM })}
            />
            <NumField label="Turn angle" unit="°" value={t.turnAngleDeg} min={5} max={180} step={5} onChange={(turnAngleDeg) => updateTrack({ turnAngleDeg })} />
          </>
        )}
        <NumField label="Length before" unit="m" value={t.lengthBeforeM} min={5} max={100} step={5} onChange={(lengthBeforeM) => updateTrack({ lengthBeforeM })} />
        <NumField label="Length after" unit="m" value={t.lengthAfterM} min={5} max={100} step={5} onChange={(lengthAfterM) => updateTrack({ lengthAfterM })} />
      </Section>

      <Section title="View">
        <Check label="Read zones (3D)" value={view.showZones} onChange={(showZones) => setView({ showZones })} />
        <Slider label="Zone opacity" value={view.zoneOpacity} min={0.05} max={0.8} step={0.05} onChange={(zoneOpacity) => setView({ zoneOpacity })} />
        <Select
          label="Zone resolution"
          value={String(view.zoneStep)}
          options={[
            { value: '0.4', label: 'Coarse (40 cm)' },
            { value: '0.25', label: 'Normal (25 cm)' },
            { value: '0.15', label: 'Fine (15 cm, slow)' },
          ]}
          onChange={(v) => setView({ zoneStep: parseFloat(v) })}
        />
        <Check label="Horizontal slice" value={view.showHorizontal} onChange={(showHorizontal) => setView({ showHorizontal })} />
        <Slider label="Slice height" unit="m" value={view.sliceHeight} min={0} max={5} step={0.05} onChange={(sliceHeight) => setView({ sliceHeight })} />
        <Check label="Finish-plane slice" value={view.showFinishSlice} onChange={(showFinishSlice) => setView({ showFinishSlice })} />
        <Select
          label="Slice colours"
          value={view.sliceMode}
          options={[
            { value: 'dominant', label: 'Strongest antenna' },
            { value: 'overlap', label: 'Antenna overlap count' },
            { value: 'rssi', label: 'Best RSSI' },
            { value: 'margin', label: 'Link margin (0–20 dB)' },
          ]}
          onChange={(sliceMode) => setView({ sliceMode })}
        />
        <Slider label="Slice opacity" value={view.sliceOpacity} min={0.1} max={1} step={0.05} onChange={(sliceOpacity) => setView({ sliceOpacity })} />
        <Check label="Simulated passes & virtual wall" value={view.showPasses} onChange={(showPasses) => setView({ showPasses })} />
      </Section>
    </>
  );
}
