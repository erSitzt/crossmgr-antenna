import { useEffect, useMemo, useState } from 'react';
import { closeStalePasses, estimateFor, useLive, type Pass, type PassTruth, type RawRead } from '../live/liveClient';
import { DEFAULT_SIM_READER, simReader, type SimReaderOptions } from '../live/simReader';
import { quadFit } from '../rf/regression';
import { laneOffsets, peakRssiAlongLane } from '../rf/passSim';
import { finishWidth } from '../rf/track';
import { portColor, useStore } from '../store';
import { NumField, Section, Select } from './controls';
import { RssiChart } from './RssiChart';

export function LivePanel() {
  const live = useLive();
  const setup = useStore((s) => s.setup);
  const updateAntenna = useStore((s) => s.updateAntenna);
  const [host, setHost] = useState(() => localStorageGet('crossmgr-antenna.host') ?? '192.168.1.100');
  const [mock, setMock] = useState(false);
  const [selPass, setSelPass] = useState<number | null>(null);
  const [source, setSource] = useState<'reader' | 'sim'>(live.source === 'sim' ? 'sim' : 'reader');

  useEffect(() => {
    live.openSocket();
    const t = setInterval(closeStalePasses, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lanes = laneOffsets(finishWidth(setup.track), setup.sim.lanes);
  const connect = () => {
    try { localStorage.setItem('crossmgr-antenna.host', host); } catch { /* ignore */ }
    live.send({ cmd: 'connect', host, mock });
  };
  const pushConfig = () =>
    live.send({
      cmd: 'configure',
      antennas: setup.antennas.map((a) => ({ port: a.port, txDbm: a.txDbm, enabled: a.enabled })),
      rxSensDbm: setup.env.readerSensDbm,
    });

  const closed = live.passes.filter((p) => p.closed).slice().reverse();
  const shown: Pass | undefined =
    live.passes.find((p) => p.id === selPass) ?? live.passes.filter((p) => p.closed).at(-1) ?? live.passes.at(-1);
  const est = shown ? estimateFor(shown, setup.sim.antennaChoice, setup.sim.method) : null;
  const shownTruth = shown ? truthFor(shown, live.truths) : undefined;
  // simulated passes: time axis relative to the true crossing, estimate in red; otherwise relative to the estimate
  const t0 = shownTruth ? shownTruth.crossUs : est ?? shown?.startTs ?? 0;
  const chartReads = shown ? shown.reads.map((r) => ({ t: (r.ts - t0) / 1e6, port: r.port, rssi: r.rssi })) : [];
  const simErrors = closed
    .map((p) => {
      const tr = truthFor(p, live.truths);
      const e = estimateFor(p, setup.sim.antennaChoice, setup.sim.method);
      return tr && e !== null ? ((e - tr.crossUs) / 1e6) * tr.speedMs * 100 : null;
    })
    .filter((x): x is number => x !== null);

  const calibration = useCalibration(closed, setup);

  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ setup, recordedAt: new Date().toISOString(), passes: live.passes, reads: live.recording }, null, 1)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `live-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Section title="Reader connection">
        <div className="row">
          <span className="muted">Source:</span>
          <button className={source === 'reader' ? 'on' : ''} onClick={() => setSource('reader')}>Impinj reader / backend</button>
          <button className={source === 'sim' ? 'on' : ''} onClick={() => setSource('sim')}>Simulated from model</button>
        </div>
        {source === 'reader' ? (
          <>
        <p className="muted">
              Start the bridge with <code>python server/app.py</code>. Stop CrossMgrImpinj first – the reader accepts only one LLRP client.
            </p>
            <p>
              Backend: <b className={live.wsOpen ? '' : 'warn'}>{live.wsOpen ? 'connected' : 'offline'}</b>
              {!live.wsOpen && <button style={{ marginLeft: 8 }} onClick={live.openSocket}>Retry</button>}
              {' · '}Reader: <b>{live.status.connected ? (live.status.running ? 'reading' : 'connected') : 'not connected'}</b>
              {live.status.mode === 'mock' && ' (mock)'}
            </p>
            <label className="field">
              <span>Reader IP</span>
              <input value={host} onChange={(e) => setHost(e.target.value)} disabled={mock} />
            </label>
            <label className="check">
              <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
              <span>Mock reader in the backend (random passes, not based on the model)</span>
            </label>
            <div className="row">
              <button onClick={connect} disabled={!live.wsOpen}>Connect</button>
              <button onClick={pushConfig} disabled={!live.status.connected} title="Send enabled ports and Tx power of the current setup">Push antenna config</button>
              <button className="primary" onClick={() => live.send({ cmd: 'start' })} disabled={!live.status.connected || live.status.running}>Start</button>
              <button onClick={() => live.send({ cmd: 'stop' })} disabled={!live.status.running}>Stop</button>
              <button onClick={() => live.send({ cmd: 'disconnect' })} disabled={!live.status.connected}>Disconnect</button>
            </div>
          </>
        ) : (
          <SimReaderControls />
        )}
        <div className="log">{live.log.slice(-8).map((l, i) => <div key={i}>{l}</div>)}</div>
      </Section>

      <Section
        title={`Passes (${live.totalReads} reads)`}
        actions={
          <>
            <button onClick={download} disabled={!live.recording.length}>Download</button>
            <button onClick={live.clear}>Clear</button>
          </>
        }
      >
        <label className="field">
          <span>Next pass lane</span>
          <select value={live.currentLane ?? ''} onChange={(e) => live.setLane(e.target.value === '' ? null : parseFloat(e.target.value))}>
            <option value="">unknown</option>
            {lanes.map((l) => <option key={l} value={l}>{l > 0 ? '+' : ''}{l.toFixed(2)} m</option>)}
          </select>
        </label>
        <p className="muted">Mark the lane before walking/riding the test tag through – it is used for calibration.</p>
        <table className="tbl lanes">
          <thead>
            <tr><th>Tag</th><th>Reads</th><th>Ports</th><th>Peak</th><th>Lane</th>{live.truths.length > 0 && <th title="Estimated minus true finish crossing, as distance">Error</th>}<th /></tr>
          </thead>
          <tbody>
            {closed.slice(0, 30).map((p) => {
              const perPort = countPorts(p);
              return (
                <tr key={p.id} className={shown?.id === p.id ? 'sel' : ''} onClick={() => setSelPass(p.id)}>
                  <td title={p.epc}>…{p.epc.slice(-6)}</td>
                  <td>{p.reads.length}</td>
                  <td>
                    {Object.entries(perPort).map(([port, n]) => (
                      <span key={port} style={{ color: portColor(+port), marginLeft: 4 }}>{n}</span>
                    ))}
                  </td>
                  <td>{Math.max(...p.reads.map((r) => r.rssi)).toFixed(0)}</td>
                  <td>{p.lateralM === null ? '–' : p.lateralM.toFixed(1)}</td>
                  {live.truths.length > 0 && <td>{passErrorCm(p, live.truths, setup) ?? '–'}</td>}
                  <td><button onClick={(e) => { e.stopPropagation(); live.deletePass(p.id); }}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {simErrors.length > 0 && (
          <p>
            Simulated passes: timing error {mean(simErrors).toFixed(0)} cm mean, {std(simErrors).toFixed(0)} cm spread over {simErrors.length} passes
            (estimate vs. true crossing).
          </p>
        )}
        {shown && (
          <>
            <p className="muted">
              Pass {shown.id}{shown.closed ? '' : ' (in progress)'}
              {shownTruth ? ` – ${shownTruth.label}; time axis relative to the true crossing (white), estimate red.` : ' – time axis relative to the estimated crossing.'}
            </p>
            <RssiChart reads={chartReads} estimate={est === null ? null : (est - t0) / 1e6} />
          </>
        )}
      </Section>

      <Section title="Calibration (measured vs model)">
        {calibration.length === 0 ? (
          <p className="muted">Record passes with a marked lane to compare measured peak RSSI per port with the model.</p>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr><th>Port</th><th>Passes</th><th>Measured − model</th><th>Suggested cable loss</th><th /></tr>
              </thead>
              <tbody>
                {calibration.map((c) => (
                  <tr key={c.port}>
                    <td style={{ color: portColor(c.port) }}>P{c.port}</td>
                    <td>{c.n}</td>
                    <td>{c.offsetDb > 0 ? '+' : ''}{c.offsetDb.toFixed(1)} dB</td>
                    <td>{c.antenna ? `${c.antenna.cableLossDb} → ${c.suggestedLoss.toFixed(1)} dB` : '–'}</td>
                    <td>
                      {c.antenna && (
                        <button onClick={() => updateAntenna(c.antenna!.id, { cableLossDb: +c.suggestedLoss.toFixed(1) })}>Apply</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              The RSSI offset is folded into the antenna's effective loss (RSSI counts the loss twice, so loss changes by −offset/2).
              After applying, re-run the simulation and optimiser with the calibrated model.
            </p>
          </>
        )}
      </Section>
    </>
  );
}

function countPorts(p: Pass): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of p.reads) out[r.port] = (out[r.port] ?? 0) + 1;
  return out;
}

function useCalibration(passes: Pass[], setup: ReturnType<typeof useStore.getState>['setup']) {
  return useMemo(() => {
    const byPort = new Map<number, number[]>();
    const cache = new Map<number, Record<number, number>>();
    for (const p of passes) {
      if (p.lateralM === null) continue;
      if (!cache.has(p.lateralM)) cache.set(p.lateralM, peakRssiAlongLane(setup, p.lateralM));
      const model = cache.get(p.lateralM)!;
      const peaks: Record<number, number> = {};
      const readsByPort = new Map<number, typeof p.reads>();
      for (const r of p.reads) readsByPort.set(r.port, [...(readsByPort.get(r.port) ?? []), r]);
      for (const [port, rs] of readsByPort) {
        const pk = robustPeak(rs);
        if (pk !== null) peaks[port] = pk;
      }
      for (const [port, peak] of Object.entries(peaks)) {
        const m = model[+port];
        if (m === undefined) continue;
        const l = byPort.get(+port) ?? [];
        l.push(peak - m);
        byPort.set(+port, l);
      }
    }
    return [...byPort.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([port, offs]) => {
        const offsetDb = offs.reduce((s, x) => s + x, 0) / offs.length;
        const antenna = setup.antennas.find((a) => a.port === port && a.enabled);
        return {
          port, n: offs.length, offsetDb, antenna,
          suggestedLoss: Math.max(0, (antenna?.cableLossDb ?? 0) - offsetDb / 2),
        };
      });
  }, [passes, setup]);
}

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const std = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

/** The simulated truth belonging to a pass (same EPC, crossing within the pass window). */
function truthFor(p: Pass, truths: PassTruth[]): PassTruth | undefined {
  for (let i = truths.length - 1; i >= 0; i--) {
    const t = truths[i];
    if (t.epc === p.epc && t.crossUs >= p.startTs - 3e6 && t.crossUs <= p.endTs + 3e6) return t;
  }
  return undefined;
}

function passErrorCm(p: Pass, truths: PassTruth[], setup: ReturnType<typeof useStore.getState>['setup']): string | null {
  const t = truthFor(p, truths);
  const e = estimateFor(p, setup.sim.antennaChoice, setup.sim.method);
  if (!t || e === null) return null;
  const cm = ((e - t.crossUs) / 1e6) * t.speedMs * 100;
  return `${cm >= 0 ? '+' : ''}${cm.toFixed(0)} cm`;
}

/**
 * Peak RSSI of one port during a pass, robust against single noisy reads: vertex of a quadratic
 * fit when it is plausible, otherwise the mean of the three strongest reads.
 */
function robustPeak(rs: RawRead[]): number | null {
  if (rs.length === 0) return null;
  const sorted = rs.map((r) => r.rssi).sort((a, b) => b - a);
  const top3 = mean(sorted.slice(0, 3));
  if (rs.length >= 6) {
    const t0 = rs[0].ts;
    const fit = quadFit(rs.map((r) => (r.ts - t0) / 1e6), rs.map((r) => r.rssi));
    if (fit && fit.a < 0) {
      const v = fit.c - (fit.b * fit.b) / (4 * fit.a);
      if (v <= sorted[0] && v >= sorted[0] - 6) return v;
    }
  }
  return top3;
}

/** Controls for the model-driven reader emulator. */
function SimReaderControls() {
  const setup = useStore((s) => s.setup);
  const live = useLive();
  const [opts, setOpts] = useState<SimReaderOptions>(DEFAULT_SIM_READER);
  const running = live.source === 'sim' && live.status.running;
  const set = (p: Partial<SimReaderOptions>) => {
    const next = { ...opts, ...p };
    setOpts(next);
    simReader.update(next);
  };
  const ports = [...new Set(setup.antennas.filter((a) => a.enabled).map((a) => a.port))].sort();
  return (
    <>
      <p className="muted">
        Emulates the reader with the RF model: simulated riders ride through your current setup (antennas, arch, track, obstacles,
        ground, tag{setup.tag2Enabled ? 's' : ''}). Reads stream into the pass list, chart and calibration exactly like a real reader;
        the true crossing is known, so every pass shows its timing error. No backend or hardware needed.
      </p>
      <div className="grid2">
        <NumField label="Rider every" unit="s" value={opts.intervalS} min={0.5} max={60} step={0.5} onChange={(intervalS) => set({ intervalS })} />
        <NumField label="Riders (EPCs)" value={opts.riders} min={1} max={200} step={1} onChange={(riders) => set({ riders: Math.round(riders) })} />
        <NumField label="Speed variation ±" unit="%" value={Math.round(opts.speedJitter * 100)} min={0} max={50} step={5} onChange={(v) => set({ speedJitter: v / 100 })} />
        <Select
          label="Riders use"
          value={opts.mode}
          options={[
            { value: 'lanes', label: 'Straight lanes (marked, for calibration)' },
            { value: 'mixed', label: 'Lanes + rider lines (unmarked)' },
          ]}
          onChange={(mode) => set({ mode })}
        />
      </div>
      <p className="subhead">Real world vs. model (to rehearse calibration)</p>
      <p className="muted">Extra one-way loss per port that the "real" reader has but the model does not – e.g. a longer cable. Calibration should find it.</p>
      <div className="grid3">
        {ports.map((port) => (
          <NumField
            key={port}
            label={`Port ${port}`}
            unit="dB"
            value={opts.deviationDb[port] ?? 0}
            min={-10}
            max={20}
            step={0.5}
            onChange={(v) => set({ deviationDb: { ...opts.deviationDb, [port]: v } })}
          />
        ))}
      </div>
      <div className="row">
        <button className="primary" disabled={running} onClick={() => simReader.start(opts)}>Start riders</button>
        <button disabled={!running} onClick={() => simReader.stop()}>Stop</button>
        <button onClick={() => simReader.sendOne()}>Send one rider</button>
        <button onClick={() => simReader.disconnect()}>Off</button>
      </div>
      <p className="muted">Speed, timing method and antenna choice come from the Simulation tab; edits to the setup apply to the next rider.</p>
    </>
  );
}
