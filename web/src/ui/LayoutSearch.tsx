import { useState } from 'react';
import type { TrussMember } from '../model/types';
import type { LayoutProgress, LayoutResult } from '../rf/layoutSearch';
import { layoutSearchAsync } from '../rf/workerClient';
import { portColor, useStore } from '../store';
import { Check, NumField, Section, Select } from './controls';

/** Searches antenna count, positions on the arch, aim and power for the best virtual wall. */
export function LayoutSearchSection() {
  const setup = useStore((s) => s.setup);
  const replaceAntennas = useStore((s) => s.replaceAntennas);
  const setSim = useStore((s) => s.setSim);
  const [maxAntennas, setMax] = useState(Math.min(4, setup.readerProfile.ports));
  const [trussId, setTrussId] = useState(setup.trusses[0]?.id ?? '');
  const [profileId, setProfileId] = useState(setup.antennas[0]?.profileId ?? setup.antennaProfiles[0]?.id ?? '');
  const [members, setMembers] = useState<TrussMember[]>(['left', 'right', 'top']);
  const [tx, setTx] = useState(27);
  const [trials, setTrials] = useState(2);
  const [withPower, setWithPower] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LayoutProgress | null>(null);
  const [results, setResults] = useState<LayoutResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const truss = setup.trusses.find((t) => t.id === trussId) ?? setup.trusses[0];
  const toggle = (m: TrussMember, on: boolean) => setMembers((ms) => (on ? [...new Set([...ms, m])] : ms.filter((x) => x !== m)));

  const run = async () => {
    if (!truss) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setProgress(null);
    try {
      const res = await layoutSearchAsync(
        setup,
        { maxAntennas, trussId: truss.id, profileId, members, searchTxDbm: tx, searchTrials: trials, optimizePower: withPower },
        setProgress,
      );
      setResults(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const best = results?.reduce((a, b) => (b.sim.score < a.sim.score ? b : a), results[0]);

  if (!truss) {
    return (
      <Section title="Antenna layout search">
        <p className="muted">Add a finish arch (truss) first – the search places antennas on its uprights and crossbar.</p>
      </Section>
    );
  }

  return (
    <Section title="Antenna layout search">
      <p className="muted">
        Tries antennas on the arch (uprights at 0.5 m steps, aimed across or towards riders, level to 30° down; crossbar at 5 offsets,
        down or tilted towards riders), adds them one by one up to the maximum, re-tries every placement and optimises power.
        All lanes and rider lines count. Existing antennas are only replaced when you apply a result.
      </p>
      <div className="grid2">
        <NumField label="Max antennas" value={maxAntennas} min={1} max={Math.min(4, setup.readerProfile.ports)} step={1} onChange={(v) => setMax(Math.round(v))} />
        <NumField label="Search power" unit="dBm" value={tx} min={setup.readerProfile.minTxDbm} max={setup.readerProfile.maxTxDbm} step={0.5} onChange={setTx} />
        <NumField label="Trials while searching" value={trials} min={1} max={10} step={1} title="Fewer = faster but noisier comparison; final results use the full trial count" onChange={(v) => setTrials(Math.round(v))} />
        <Select label="Truss" value={truss.id} options={setup.trusses.map((t) => ({ value: t.id, label: t.name }))} onChange={setTrussId} />
      </div>
      <Select label="Antenna model" value={profileId} options={setup.antennaProfiles.map((p) => ({ value: p.id, label: p.name }))} onChange={setProfileId} />
      <div className="row">
        <span className="muted">Allowed:</span>
        <Check label="Left upright" value={members.includes('left')} onChange={(v) => toggle('left', v)} />
        <Check label="Right upright" value={members.includes('right')} onChange={(v) => toggle('right', v)} />
        <Check label="Crossbar" value={members.includes('top')} onChange={(v) => toggle('top', v)} />
      </div>
      <Check label="Optimise power for each result" value={withPower} onChange={setWithPower} />
      <div className="row">
        <button className="primary" disabled={busy || members.length === 0} onClick={run}>
          {busy ? 'Searching…' : 'Find best layout'}
        </button>
        {busy && progress && (
          <span className="muted">
            {progress.phase} · {progress.evaluations} layouts tried{progress.bestScore !== null ? ` · score ${progress.bestScore.toFixed(1)}` : ''}
          </span>
        )}
      </div>
      {busy && <p className="muted">This can take a minute (about 15–60 s depending on lines and trials).</p>}
      {error && <p className="warn">{error}</p>}
      {results && (
        <>
          <table className="tbl">
            <thead>
              <tr><th>Antennas</th><th>Score</th><th>Missed</th><th>Offset</th><th>Spread</th><th>Worst</th><th /></tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.count} className={r === best ? 'sel' : ''}>
                  <td>{r.count}{r === best ? ' ★' : ''}</td>
                  <td>{r.sim.score.toFixed(1)}</td>
                  <td className={r.sim.missRate > 0 ? 'warn' : ''}>{(r.sim.missRate * 100).toFixed(0)}%</td>
                  <td>{r.sim.meanErrCm.toFixed(0)} cm</td>
                  <td>{r.sim.stdErrCm.toFixed(0)} cm</td>
                  <td>{r.sim.maxAbsLaneErrCm.toFixed(0)} cm</td>
                  <td>
                    <button
                      onClick={() => {
                        replaceAntennas(r.antennas);
                        setSim({ sim: r.sim, selectedLane: 0 });
                      }}
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.map((r) => (
            <details key={r.count} className="profile" open={r === best}>
              <summary>{r.count} antenna{r.count > 1 ? 's' : ''}{r === best ? ' (best score)' : ''}</summary>
              <ul className="layout-list">
                {r.antennas.map((a, i) => (
                  <li key={a.id}>
                    <span className="dot" style={{ background: portColor(a.port) }} /> P{a.port}: {r.labels[i]} · {a.txDbm} dBm
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <p className="muted">
            Score = missed passes (heavy penalty) + |mean offset| + spread + ½ worst line + too-few-reads penalty; lower is better. More antennas
            are not always better: the reader switches between ports, so each antenna gets fewer reads.
          </p>
        </>
      )}
    </Section>
  );
}
