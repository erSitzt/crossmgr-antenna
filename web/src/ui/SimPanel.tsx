import { useMemo, useState } from 'react';
import { estimatePassTime } from '../rf/regression';
import { optimizeAsync, runSimAsync } from '../rf/workerClient';
import { portColor, useStore } from '../store';
import { Check, NumField, Section, Select } from './controls';
import { RssiChart } from './RssiChart';

export function SimPanel() {
  const setup = useStore((s) => s.setup);
  const updateSim = useStore((s) => s.updateSim);
  const sim = useStore((s) => s.sim);
  const simBusy = useStore((s) => s.simBusy);
  const setSim = useStore((s) => s.setSim);
  const progress = useStore((s) => s.optimizeProgress);
  const selectedLane = useStore((s) => s.selectedLane);
  const applyTx = useStore((s) => s.applyTxPowers);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const [suggestion, setSuggestion] = useState<Record<string, number> | null>(null);
  const cfg = setup.sim;

  const run = async () => {
    setSim({ simBusy: true });
    try {
      setSim({ sim: await runSimAsync(setup) });
    } finally {
      setSim({ simBusy: false });
    }
  };
  const optimize = async () => {
    setSim({ simBusy: true, optimizeProgress: null });
    setSuggestion(null);
    try {
      const res = await optimizeAsync(setup, (p) => setSim({ optimizeProgress: p }));
      setSuggestion(res.txDbm);
      setSim({ sim: res });
    } finally {
      setSim({ simBusy: false });
    }
  };

  const lane = sim?.lanes[selectedLane];
  const estimate = useMemo(
    () => (lane ? estimatePassTime(lane.sampleReads, cfg.antennaChoice, cfg.method) : null),
    [lane, cfg.antennaChoice, cfg.method],
  );
  const ports = [...new Set(setup.antennas.filter((a) => a.enabled).map((a) => a.port))].sort();

  return (
    <>
      <Section title="Pass simulation">
        <div className="grid2">
          <NumField label="Lanes" value={cfg.lanes} min={1} max={25} step={1} onChange={(lanes) => updateSim({ lanes: Math.round(lanes) })} />
          <NumField label="Speed" unit="km/h" value={cfg.speedKmh} min={1} max={120} step={5} onChange={(speedKmh) => updateSim({ speedKmh })} />
          <NumField label="Trials / lane" value={cfg.trials} min={1} max={100} step={1} onChange={(trials) => updateSim({ trials: Math.round(trials) })} />
          <NumField label="RSSI noise σ" unit="dB" value={cfg.rssiNoiseDb} min={0} max={10} step={0.5} onChange={(rssiNoiseDb) => updateSim({ rssiNoiseDb })} />
          <NumField label="Sim range ±" unit="m" value={cfg.rangeM} min={3} max={40} step={1} onChange={(rangeM) => updateSim({ rangeM })} />
          <NumField label="Seed" value={cfg.seed} step={1} onChange={(seed) => updateSim({ seed: Math.round(seed) })} />
        </div>
        <Select
          label="Antenna choice"
          value={cfg.antennaChoice}
          options={[
            { value: 'mostReads', label: 'Most reads' },
            { value: 'strongest', label: 'Strongest read' },
          ]}
          onChange={(antennaChoice) => updateSim({ antennaChoice })}
        />
        <Select
          label="Time method"
          value={cfg.method}
          options={[
            { value: 'quadratic', label: 'Quadratic regression (peak)' },
            { value: 'strongest', label: 'Strongest read' },
            { value: 'first', label: 'First read' },
          ]}
          onChange={(method) => updateSim({ method })}
        />
        <Check label="Re-run automatically on changes" value={view.autoSim} onChange={(autoSim) => setView({ autoSim })} />
        <div className="row">
          <button className="primary" disabled={simBusy} onClick={run}>Run simulation</button>
          <button disabled={simBusy} onClick={optimize}>Optimise power</button>
          {simBusy && progress && <span className="muted">iter {progress.iteration}, score {progress.score.toFixed(1)}</span>}
        </div>
      </Section>

      {suggestion && (
        <Section title="Suggested power">
          <table className="tbl">
            <tbody>
              {setup.antennas.filter((a) => suggestion[a.id] !== undefined).map((a) => (
                <tr key={a.id}>
                  <td><span className="dot" style={{ background: portColor(a.port) }} /> P{a.port} {a.name}</td>
                  <td>{a.txDbm} → <b>{suggestion[a.id]}</b> dBm</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button className="primary" onClick={() => { applyTx(suggestion); setSuggestion(null); }}>Apply</button>
            <button onClick={() => setSuggestion(null)}>Discard</button>
          </div>
        </Section>
      )}

      {sim && (
        <Section title="Virtual wall">
          <div className="kpis">
            <div><b className={Math.abs(sim.meanErrCm) > 50 ? 'warn' : ''}>{sim.meanErrCm.toFixed(0)} cm</b><span>mean offset</span></div>
            <div><b>{sim.stdErrCm.toFixed(0)} cm</b><span>spread (σ)</span></div>
            <div><b>{sim.maxAbsLaneErrCm.toFixed(0)} cm</b><span>worst lane</span></div>
            <div><b className={sim.missRate > 0 ? 'warn' : ''}>{(sim.missRate * 100).toFixed(0)} %</b><span>missed</span></div>
          </div>
          <p className="muted">Offset + = timing fires after the finish line (tag already past it).</p>
          <table className="tbl lanes">
            <thead>
              <tr>
                <th>Lane</th>
                <th>Reads</th>
                {ports.map((p) => <th key={p} style={{ color: portColor(p) }}>P{p}</th>)}
                <th>Offset</th>
                <th>Miss</th>
              </tr>
            </thead>
            <tbody>
              {sim.lanes.map((l, i) => (
                <tr key={i} className={i === selectedLane ? 'sel' : ''} onClick={() => setSim({ selectedLane: i })}>
                  <td>{l.lateralM > 0 ? '+' : ''}{l.lateralM.toFixed(1)} m</td>
                  <td>{l.meanReads.toFixed(0)}</td>
                  {ports.map((p) => <td key={p}>{(l.readsPerPort[p] ?? 0).toFixed(0)}</td>)}
                  <td>{l.errorsCm.length ? `${l.meanErrCm.toFixed(0)} ±${l.stdErrCm.toFixed(0)}` : '–'}</td>
                  <td className={l.missRate > 0 ? 'warn' : ''}>{(l.missRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Lane offset: − = left side, + = right side (in direction of travel). Click a lane to see its reads.</p>
          {lane && <RssiChart reads={lane.sampleReads} estimate={estimate} />}
        </Section>
      )}
    </>
  );
}
