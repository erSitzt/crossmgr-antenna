import { useMemo, useRef, useState } from 'react';
import type { SegmentKind, Setup, Track, Truss } from '../model/types';
import { TRACK_PRESETS, type TrackPreset } from '../presets/templates';
import { elevationAtU, finishU, segmentLength, segmentStarts, totalLength, widthAtU } from '../rf/track';
import { LIMIT_LEGEND } from '../scene/FieldViews';
import { useStore } from '../store';
import { Check, NumField, Section, Select, Slider } from './controls';

export function SetupPanel() {
  const setup = useStore((s) => s.setup);
  const newFromTemplate = useStore((s) => s.newFromTemplate);
  const loadSetup = useStore((s) => s.loadSetup);
  const setName = useStore((s) => s.setName);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState<TrackPreset>('tableAfterRight');

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
      loadSetup(JSON.parse(await f.text()) as Setup);
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
          <select value={preset} onChange={(e) => setPreset(e.target.value as TrackPreset)} style={{ flex: 1 }}>
            {TRACK_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button onClick={() => confirm('Replace the whole setup (track, arch, antennas)?') && newFromTemplate(preset)}>New setup</button>
        </div>
      </Section>

      <TrackEditor track={setup.track} />
      <ArchSection trusses={setup.trusses} />

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
        <Slider label="Slice height above finish" unit="m" value={view.sliceHeight} min={0} max={5} step={0.05} onChange={(sliceHeight) => setView({ sliceHeight })} />
        <Check label="Finish-plane slice" value={view.showFinishSlice} onChange={(showFinishSlice) => setView({ showFinishSlice })} />
        <Select
          label="Slice colours"
          value={view.sliceMode}
          options={[
            { value: 'dominant', label: 'Strongest antenna' },
            { value: 'overlap', label: 'Antenna overlap count' },
            { value: 'rssi', label: 'Best RSSI' },
            { value: 'margin', label: 'Link margin (0–20 dB)' },
            { value: 'limit', label: 'What limits the read' },
          ]}
          onChange={(sliceMode) => setView({ sliceMode })}
        />
        {view.sliceMode === 'limit' && <LimitLegend />}
        <Slider label="Slice opacity" value={view.sliceOpacity} min={0.1} max={1} step={0.05} onChange={(sliceOpacity) => setView({ sliceOpacity })} />
        <Check label="Simulated passes & virtual wall" value={view.showPasses} onChange={(showPasses) => setView({ showPasses })} />
      </Section>
    </>
  );
}

const KIND_LABEL: Record<SegmentKind, string> = { straight: 'Straight', left: 'Left turn', right: 'Right turn' };

function TrackEditor({ track }: { track: Track }) {
  const updateTrack = useStore((s) => s.updateTrack);
  const setTrackPreset = useStore((s) => s.setTrackPreset);
  const addSegment = useStore((s) => s.addSegment);
  const updateSegment = useStore((s) => s.updateSegment);
  const removeSegment = useStore((s) => s.removeSegment);
  const moveSegment = useStore((s) => s.moveSegment);
  const [preset, setPreset] = useState<TrackPreset>('tableAfterRight');
  const starts = segmentStarts(track);
  const fU = finishU(track);

  return (
    <Section title="Track (in direction of travel)">
      <div className="row">
        <select value={preset} onChange={(e) => setPreset(e.target.value as TrackPreset)} style={{ flex: 1 }}>
          {TRACK_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <button onClick={() => confirm('Replace the track layout (arch and antennas stay)?') && setTrackPreset(preset)}>Use track</button>
      </div>
      <div className="grid2">
        <NumField label="Start elevation" unit="m" value={track.startElevationM} step={0.1} onChange={(startElevationM) => updateTrack({ startElevationM })} />
        {track.segments[0]?.taper && (
          <NumField label="Start width" unit="m" value={track.widthM} min={1} max={40} step={0.5} title="Width at the start of segment 1 (it tapers from here)" onChange={(widthM) => updateTrack({ widthM })} />
        )}
      </div>
      <div className="row">
        <span className="muted">Set all widths:</span>
        {[6, 8, 10, 12].map((w) => (
          <button key={w} onClick={() => { updateTrack({ widthM: w }); track.segments.forEach((g) => updateSegment(g.id, { widthM: w })); }}>{w} m</button>
        ))}
      </div>

      <ElevationProfile track={track} />

      <ol className="segments">
        {track.segments.map((g, i) => {
          const isFinish = g.id === track.finishSegmentId;
          const len = segmentLength(g);
          return (
            <li key={g.id} className={isFinish ? 'finish' : ''}>
              <div className="seg-head">
                <b>{i + 1}.</b>
                <select value={g.kind} onChange={(e) => updateSegment(g.id, { kind: e.target.value as SegmentKind })}>
                  {(Object.keys(KIND_LABEL) as SegmentKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
                <span className="muted">{len.toFixed(1)} m · {starts[i].toFixed(0)}–{(starts[i] + len).toFixed(0)} m</span>
                <span className="seg-actions">
                  <button title="Move up" disabled={i === 0} onClick={() => moveSegment(g.id, -1)}>↑</button>
                  <button title="Move down" disabled={i === track.segments.length - 1} onClick={() => moveSegment(g.id, 1)}>↓</button>
                  <button title="Insert segment after" onClick={() => addSegment(g.id)}>+</button>
                  <button title="Delete" className="danger" disabled={track.segments.length <= 1} onClick={() => removeSegment(g.id)}>×</button>
                </span>
              </div>
              <div className="grid3">
                {g.kind === 'straight' ? (
                  <NumField label="Length" unit="m" value={g.lengthM} min={0.5} step={0.5} onChange={(lengthM) => updateSegment(g.id, { lengthM })} />
                ) : (
                  <>
                    <NumField label="Radius" unit="m" value={g.radiusM} min={2} step={1} onChange={(radiusM) => updateSegment(g.id, { radiusM })} />
                    <NumField label="Angle" unit="°" value={g.angleDeg} min={5} max={270} step={5} onChange={(angleDeg) => updateSegment(g.id, { angleDeg })} />
                  </>
                )}
                <NumField label="Height change" unit="m" value={g.riseM} step={0.1} title="+ = uphill (e.g. ramp onto the finish table), − = downhill" onChange={(riseM) => updateSegment(g.id, { riseM })} />
                <NumField label={g.taper ? 'Width at end' : 'Width'} unit="m" value={g.widthM} min={1} max={40} step={0.5} onChange={(widthM) => updateSegment(g.id, { widthM })} />
              </div>
              <label className="check">
                <input type="checkbox" checked={g.taper} onChange={(e) => updateSegment(g.id, { taper: e.target.checked })} />
                <span>Taper from previous width</span>
              </label>
              {isFinish ? (
                <NumField
                  label="🏁 Finish at"
                  unit="m into segment"
                  value={track.finishOffsetM}
                  min={0}
                  max={len}
                  step={0.5}
                  onChange={(finishOffsetM) => updateTrack({ finishOffsetM })}
                />
              ) : (
                <button className="link" onClick={() => updateTrack({ finishSegmentId: g.id, finishOffsetM: Math.min(len / 2, track.finishOffsetM) })}>
                  Put finish line in this segment
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="muted">
        Finish at {fU.toFixed(1)} m of {totalLength(track).toFixed(1)} m, elevation {elevationAtU(track, fU).toFixed(2)} m, width{' '}
        {widthAtU(track, fU).toFixed(1)} m. The 3D view is centred on the finish line.
      </p>
    </Section>
  );
}

function ElevationProfile({ track }: { track: Track }) {
  const W = 360, H = 70, pad = 6;
  const { pts, fX, fY, yMin, yMax } = useMemo(() => {
    const L = Math.max(totalLength(track), 1);
    const es: number[] = [];
    for (let i = 0; i <= 100; i++) es.push(elevationAtU(track, (L * i) / 100));
    const lo = Math.min(...es, 0), hi = Math.max(...es, lo + 1);
    const x = (u: number) => pad + (u / L) * (W - 2 * pad);
    const y = (e: number) => H - pad - ((e - lo) / (hi - lo)) * (H - 2 * pad);
    const fu = finishU(track);
    return {
      pts: es.map((e, i) => `${x((L * i) / 100)},${y(e)}`).join(' '),
      fX: x(fu),
      fY: y(elevationAtU(track, fu)),
      yMin: lo,
      yMax: hi,
    };
  }, [track]);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%">
      <polyline points={`${pad},${H - pad} ${pts} ${W - pad},${H - pad}`} fill="#6b513266" stroke="#c9a46a" strokeWidth={1.5} />
      <line x1={fX} x2={fX} y1={pad} y2={H - pad} className="finish" />
      <circle cx={fX} cy={fY} r={3} fill="#fff" />
      <text x={W - pad} y={12} textAnchor="end">elevation {yMin.toFixed(1)}…{yMax.toFixed(1)} m · white = finish</text>
    </svg>
  );
}

function ArchSection({ trusses }: { trusses: Truss[] }) {
  const track = useStore((s) => s.setup.track);
  const fw = widthAtU(track, finishU(track));
  const updateTruss = useStore((s) => s.updateTruss);
  const addTruss = useStore((s) => s.addTruss);
  const select = useStore((s) => s.select);
  return (
    <Section title="Finish arch (truss)" actions={<button onClick={addTruss}>+ Truss</button>}>
      {trusses.length === 0 && <p className="muted">No truss – antennas are free-standing.</p>}
      {trusses.map((t) => (
        <div key={t.id} className="arch">
          <div className="row">
            <b>{t.name}</b>
            <button className="link" onClick={() => select(t.id)}>select in 3D</button>
          </div>
          <div className="grid3">
            <NumField label="Clear height" unit="m" value={t.heightM} min={1} max={10} step={0.1} title="Height of the crossbar centre above the truss base" onChange={(heightM) => updateTruss(t.id, { heightM })} />
            <NumField label="Span" unit="m" value={t.spanM} min={1} max={40} step={0.5} onChange={(spanM) => updateTruss(t.id, { spanM })} />
            <NumField label="Section" unit="m" value={t.sectionM} min={0.1} max={0.6} step={0.01} onChange={(sectionM) => updateTruss(t.id, { sectionM })} />
          </div>
          {t.spanM - t.sectionM < fw && (
            <p className="warn">
              Uprights stand on the track (finish width {fw.toFixed(1)} m).{' '}
              <button className="link" onClick={() => updateTruss(t.id, { spanM: Math.ceil((fw + 1.2) * 2) / 2 })}>Fit span to track</button>
            </p>
          )}
          <Check label="Base follows track elevation" value={t.followTrack} onChange={(followTrack) => updateTruss(t.id, { followTrack })} />
          {!t.followTrack && (
            <NumField label="Base elevation" unit="m" value={t.position[1]} step={0.1} onChange={(y) => updateTruss(t.id, { position: [t.position[0], y, t.position[2]] })} />
          )}
        </div>
      ))}
      <p className="muted">Antennas mounted on the truss move with it when you change height, span or position.</p>
    </Section>
  );
}

export function LimitLegend() {
  return (
    <ul className="legend-list">
      {LIMIT_LEGEND.map((l) => (
        <li key={l.label} title={l.hint}>
          <span className="dot" style={{ background: l.color, borderRadius: 2 }} /> <b>{l.label}</b> <span className="muted">– {l.hint}</span>
        </li>
      ))}
    </ul>
  );
}
