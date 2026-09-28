import { useEffect, useMemo, useState } from 'react';
import { closeStalePasses, estimateFor, useLive, type Pass } from '../live/liveClient';
import { laneOffsets, peakRssiAlongLane } from '../rf/passSim';
import { finishWidth } from '../rf/track';
import { portColor, useStore } from '../store';
import { Section } from './controls';
import { RssiChart } from './RssiChart';

export function LivePanel() {
  const live = useLive();
  const setup = useStore((s) => s.setup);
  const updateAntenna = useStore((s) => s.updateAntenna);
  const [host, setHost] = useState(() => localStorageGet('crossmgr-antenna.host') ?? '192.168.1.100');
  const [mock, setMock] = useState(false);
  const [selPass, setSelPass] = useState<number | null>(null);

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
  const chartReads = shown
    ? shown.reads.map((r) => ({ t: (r.ts - (est ?? shown.startTs)) / 1e6, port: r.port, rssi: r.rssi }))
    : [];

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
          <span>Mock reader (synthetic passes, no hardware)</span>
        </label>
        <div className="row">
          <button onClick={connect} disabled={!live.wsOpen}>Connect</button>
          <button onClick={pushConfig} disabled={!live.status.connected} title="Send enabled ports and Tx power of the current setup">Push antenna config</button>
          <button className="primary" onClick={() => live.send({ cmd: 'start' })} disabled={!live.status.connected || live.status.running}>Start</button>
          <button onClick={() => live.send({ cmd: 'stop' })} disabled={!live.status.running}>Stop</button>
          <button onClick={() => live.send({ cmd: 'disconnect' })} disabled={!live.status.connected}>Disconnect</button>
        </div>
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
            <tr><th>Tag</th><th>Reads</th><th>Ports</th><th>Peak</th><th>Lane</th><th /></tr>
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
                  <td><button onClick={(e) => { e.stopPropagation(); live.deletePass(p.id); }}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown && (
          <>
            <p className="muted">Pass {shown.id}{shown.closed ? '' : ' (in progress)'} – time axis relative to the estimated crossing.</p>
            <RssiChart reads={chartReads} estimate={est === null ? null : 0} />
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
      for (const r of p.reads) peaks[r.port] = Math.max(peaks[r.port] ?? -Infinity, r.rssi);
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
